// SpaceHub (meeting rooms) and ServeIQ (queue management) connectors.
//
// MADAR reads the same lobby summaries the SpaceHub and ServeIQ TV apps show,
// server side, and serves them to MADAR TVs through /api/app/operations in the
// meeting and queue shapes the Info Hub already renders:
//  * SpaceHub  GET {url}/tv-display              (JWT from POST {url}/auth/login,
//                                                 a DISPLAY account is enough)
//  * ServeIQ   GET {url}/tv-display/branch/{id}  (public, no login)
// Credentials stay on the server; the admin API never returns the password.
import {z} from 'zod';
import {one} from './db.mjs';
import {check,Problem} from './domain.mjs';

const CACHE_MS = 15000, STALE_MS = 90000;
const defaults = {
  spacehub: {enabled: false, url: '', email: '', password: ''},
  serveiq: {enabled: false, url: '', branchId: ''},
};
export const connectorKinds = {spacehub: 'meeting', serveiq: 'queue'};

/** An http(s) API address without credentials, query or trailing slash. */
export function apiUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  let url;
  try { url = new URL(v); } catch { check(false, 422, 'Enter the full API address, for example https://server.example.com/spacehub/api'); }
  check(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 422, 'The API address must be http(s) without credentials');
  const host = url.hostname.toLowerCase();
  check(!/^169\.254\./.test(host) && host !== 'metadata.google.internal', 422, 'Link-local and metadata addresses are not allowed');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export async function connectorSettings(db, id) {
  return {...defaults[id], ...((await one(db, 'SELECT value FROM settings WHERE key=$1', [id]))?.value || {})};
}
const passwordOf = s => s.password || process.env.SPACEHUB_PASSWORD || '';
export const connectorConfigured = (id, s) =>
  id === 'spacehub' ? Boolean(s.url && s.email && passwordOf(s)) : Boolean(s.url && s.branchId);
/** Settings safe for the admin: the SpaceHub password is never returned. */
export function connectorPublic(id, s) {
  const {password, ...rest} = s;
  return {...rest, configured: connectorConfigured(id, s),
    ...(id === 'spacehub' ? {passwordConfigured: Boolean(passwordOf(s)), passwordFromEnvironment: !s.password && Boolean(process.env.SPACEHUB_PASSWORD)} : {})};
}

async function getJson(fetchImpl, url, {method = 'GET', headers = {}, body, timeoutMs = 10000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let r;
    try {
      r = await fetchImpl(url, {method, signal: controller.signal, headers: {Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {}), ...headers}, body: body ? JSON.stringify(body) : undefined});
    } catch {
      throw new Problem(502, controller.signal.aborted ? 'The server did not respond within 10 seconds' : 'Could not reach the server address');
    }
    if (!r.ok) throw Object.assign(new Problem(502, r.status === 404 ? 'No such API at this address' : `The server returned HTTP ${r.status}`), {httpStatus: r.status});
    try { return await r.json(); } catch { throw new Problem(502, 'The server returned a response that is not JSON'); }
  } finally { clearTimeout(timer); }
}
const unwrap = body => body && typeof body === 'object' && 'data' in body && ('status' in body || 'message' in body) ? body.data : body;
const str = v => (v === null || v === undefined ? '' : String(v));

/** SpaceHub's TV summary as MADAR meeting data. Room names stay as SpaceHub sends them. */
export function mapSpaceHub(data, now = new Date()) {
  const d = data || {}, rooms = new Map();
  const room = r => {
    const key = str(r.id || r.name);
    if (!rooms.has(key)) rooms.set(key, {name: str(r.name), nameAr: str(r.arabicName), capacity: r.capacity ?? null, status: 'available'});
    return rooms.get(key);
  };
  const meeting = m => m && typeof m === 'object' ? {title: str(m.title), organizer: str(m.organizer), department: str(m.department), start: str(m.startTime), end: str(m.endTime), attendees: m.attendees ?? null} : null;
  const schedule = [];
  for (const r of Array.isArray(d.currentRooms) ? d.currentRooms : []) {
    const target = room(r), m = meeting(r.currentMeeting);
    if (m) {
      target.status = 'occupied';
      target.current = {title: m.title, start: m.start, end: m.end};
    }
  }
  for (const r of Array.isArray(d.upcomingRooms) ? d.upcomingRooms : []) {
    const target = room(r), m = meeting(r.currentMeeting);
    if (!m) continue;
    // SpaceHub lists each room's next booking today under upcomingRooms.
    if (!target.next) target.next = {title: m.title, start: m.start};
    schedule.push({time: m.start, start: m.start, end: m.end, room: target.name, title: m.title});
  }
  schedule.sort((a, b) => a.time.localeCompare(b.time));
  const list = [...rooms.values()], stats = d.statistics || {};
  const ongoing = list.filter(r => r.status === 'occupied').length;
  return {
    todayMeetings: ongoing + schedule.length,
    ongoing: Number.isFinite(stats.busyRooms) ? stats.busyRooms : ongoing,
    upcoming: schedule.length,
    availableRooms: Number.isFinite(stats.freeRooms) ? stats.freeRooms : list.filter(r => r.status === 'available').length,
    totalRooms: Number.isFinite(stats.totalRooms) ? stats.totalRooms : list.length,
    rooms: list,
    schedule,
    source: 'spacehub',
    fetchedAt: now.toISOString(),
  };
}

const counterStatus = {CALLING: 'serving', SERVING: 'serving', IDLE: 'available', PAUSED: 'paused', CLOSED: 'closed'};
/** ServeIQ's branch TV summary as MADAR queue data. */
export function mapServeIq(data, now = new Date()) {
  const d = data || {};
  const counters = (Array.isArray(d.counters) ? d.counters : []).map(c => ({
    name: str(c.counter), code: str(c.code), status: counterStatus[str(c.status).toUpperCase()] || str(c.status).toLowerCase() || 'available',
    calling: str(c.status).toUpperCase() === 'CALLING', ticket: str(c.token), ticketAr: str(c.arabicToken),
  }));
  const calls = (Array.isArray(d.latestCalls) ? d.latestCalls : []).map(c => ({ticket: str(c.token), counter: str(c.counter), service: str(c.service), ticketAr: str(c.arabicToken)}));
  const upcoming = Array.isArray(d.upcomingTokens) ? d.upcomingTokens.map(str) : [];
  return {
    servedToday: Number.isFinite(d.servedToday) ? d.servedToday : 0,
    waiting: Number.isFinite(d.waiting) ? d.waiting : upcoming.length,
    serving: Number.isFinite(d.serving) ? d.serving : counters.filter(c => c.status === 'serving').length,
    activeCounters: counters.filter(c => c.status === 'serving' || c.status === 'available').length,
    calls,
    counters,
    upcomingTokens: upcoming,
    holdTokens: Array.isArray(d.holdTokens) ? d.holdTokens.map(str) : [],
    branchName: str(d.branchName),
    source: 'serveiq',
    fetchedAt: now.toISOString(),
  };
}

export function createDisplayConnectors({db, fetchImpl = (...a) => fetch(...a), now = () => Date.now()}) {
  const cache = new Map(), status = {}, tokens = new Map();

  async function spaceHubToken(s, renew = false) {
    const key = `${s.url}|${s.email}|${passwordOf(s)}`, held = tokens.get(key);
    if (!renew && held && held.expires > now()) return held.token;
    let body;
    try {
      body = unwrap(await getJson(fetchImpl, s.url + '/auth/login', {method: 'POST', body: {email: s.email, password: passwordOf(s)}}));
    } catch (e) {
      if ([400, 401, 403].includes(e.httpStatus)) throw new Problem(502, 'SpaceHub rejected the email or password');
      throw e;
    }
    check(body?.token, 502, 'SpaceHub login returned no token');
    // Renew a minute early; DISPLAY tokens last 90 days, others 12 hours.
    const life = Number(body.expiresInSeconds) > 0 ? Number(body.expiresInSeconds) * 1000 : 3600000;
    tokens.set(key, {token: body.token, expires: now() + Math.max(30000, life - 60000)});
    return body.token;
  }

  const load = {
    async spacehub(s) {
      const call = async token => unwrap(await getJson(fetchImpl, s.url + '/tv-display', {headers: {Authorization: 'Bearer ' + token}}));
      let data;
      try { data = await call(await spaceHubToken(s)); } catch (e) {
        // A revoked or expired token: log in again once.
        if (![401, 403].includes(e.httpStatus)) throw e;
        data = await call(await spaceHubToken(s, true));
      }
      return mapSpaceHub(data, new Date(now()));
    },
    async serveiq(s) {
      const data = await getJson(fetchImpl, `${s.url}/tv-display/branch/${encodeURIComponent(s.branchId)}`);
      return mapServeIq(unwrap(data), new Date(now()));
    },
  };

  async function snapshot(id, s, {force = false} = {}) {
    const signature = JSON.stringify(s), hit = cache.get(id);
    if (!force && hit?.signature === signature && (hit.pending || now() - hit.at < CACHE_MS)) return hit.pending || hit.value;
    const pending = load[id](s).then(value => {
      const fresh = {...value, availability: 'connected', updatedAt: new Date(now()).toISOString()};
      status[id] = {lastSuccessAt: fresh.updatedAt, lastError: ''};
      cache.set(id, {signature, at: now(), value: fresh, good: fresh, goodAt: now()});
      return fresh;
    }, e => {
      status[id] = {...status[id], lastError: e.message, lastErrorAt: new Date(now()).toISOString()};
      // Keep the last good data on screen for a while, marked stale.
      const good = hit?.signature === signature && hit.good && now() - hit.goodAt < STALE_MS ? hit.good : null;
      const value = good ? {...good, availability: 'stale', error: e.message} : {availability: 'unconnected', error: e.message};
      cache.set(id, {signature, at: now(), value, good: hit?.good, goodAt: hit?.goodAt});
      return value;
    });
    cache.set(id, {...hit, signature, at: hit?.at || 0, pending});
    return pending;
  }

  return {
    /** Live meeting or queue data when that connector is turned on, otherwise null. */
    async operational(kind) {
      const id = Object.keys(connectorKinds).find(k => connectorKinds[k] === kind);
      if (!id) return null;
      const s = await connectorSettings(db, id);
      if (!s.enabled || !connectorConfigured(id, s)) return null;
      return snapshot(id, s);
    },
    async test(id) {
      const s = await connectorSettings(db, id);
      check(connectorConfigured(id, s), 422, id === 'spacehub' ? 'Enter the SpaceHub API address, email and password first' : 'Enter the ServeIQ API address and branch ID first');
      tokens.clear();
      const value = await load[id](s);
      status[id] = {lastSuccessAt: new Date(now()).toISOString(), lastError: ''};
      cache.delete(id);
      return id === 'spacehub'
        ? {rooms: value.rooms.length, ongoing: value.ongoing, availableRooms: value.availableRooms, upcoming: value.upcoming}
        : {branchName: value.branchName, counters: value.counters.length, waiting: value.waiting, servedToday: value.servedToday, calls: value.calls.length};
    },
    status: () => structuredClone(status),
    clear(id) { cache.delete(id); tokens.clear(); },
  };
}

const schemas = {
  spacehub: z.object({enabled: z.boolean(), url: z.string().max(500), email: z.string().trim().max(200), password: z.string().max(500).optional(), clearPassword: z.boolean().optional()}).strict(),
  serveiq: z.object({enabled: z.boolean(), url: z.string().max(500), branchId: z.string().trim().max(100)}).strict(),
};
const names = {spacehub: 'SpaceHub', serveiq: 'ServeIQ'};

export function registerDisplayConnectorRoutes(app, {db, admin, wrap, service, audit}) {
  for (const id of Object.keys(schemas)) {
    app.get(`/api/admin/connectors/${id}`, admin('viewer'), wrap(async (req, res) => res.json({...connectorPublic(id, await connectorSettings(db, id)), status: service.status()[id] || {}})));
    app.put(`/api/admin/connectors/${id}`, admin('admin'), wrap(async (req, res) => {
      const p = schemas[id].parse(req.body), current = await connectorSettings(db, id);
      const next = id === 'spacehub'
        ? {enabled: p.enabled, url: apiUrl(p.url), email: p.email, password: p.clearPassword ? '' : p.password?.trim() || current.password || ''}
        : {enabled: p.enabled, url: apiUrl(p.url), branchId: p.branchId};
      check(!next.enabled || connectorConfigured(id, next), 422, id === 'spacehub' ? 'Enter the SpaceHub API address, email and password before turning it on' : 'Enter the ServeIQ API address and branch ID before turning it on');
      await db.tx(async tx => {
        await tx.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [id, JSON.stringify(next)]);
        const {password, clearPassword, ...detail} = p;
        await audit(tx, req.user.email, `update-${id}`, 'settings', id, {...detail, ...(id === 'spacehub' ? {passwordChanged: Boolean(password?.trim()) || Boolean(clearPassword)} : {})});
      });
      service.clear(id);
      res.json(connectorPublic(id, next));
    }));
    app.post(`/api/admin/connectors/${id}/test`, admin('admin'), wrap(async (req, res) => {
      try { res.json(await service.test(id)); }
      catch (e) { if (e instanceof Problem) throw new Problem(e.status, `${names[id]}: ${e.message}`); throw e; }
    }));
  }
}
