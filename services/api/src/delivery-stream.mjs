import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {one, rows} from './db.mjs';

const ACTIVE = "('pending','received','downloaded','failed')";

// One dedicated consumer group owns this stream. Remove an entry only when the
// SQL ledger confirms Applied, cancellation, or an invalid message. Do not trim
// active entries: offline TVs can remain pending for longer than a Redis outage.
const REMOVE_ENTRY = `
local acknowledged = redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
return acknowledged`;

const QUARANTINE_ENTRY = `
redis.call('XADD', KEYS[2], 'MAXLEN', '~', '1000', '*',
  'entryId', ARGV[2], 'reason', ARGV[3])
local acknowledged = redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
return acknowledged`;

function fieldsOf(fields) {
  if (!Array.isArray(fields) || fields.length % 2) return null;
  const result = {};
  for (let i = 0; i < fields.length; i += 2) result[fields[i]] = fields[i + 1];
  return result;
}

export class DeliveryStream {
  constructor({db, redis, emit, logger = null,
    stream = process.env.REDIS_DELIVERY_STREAM || 'madar:{delivery}:updates',
    group = 'madar-dispatchers', consumer = `${hostname()}-${randomUUID()}`,
    batchSize = 100, claimIdleMs = 60000, reconcileIntervalMs = 30000} = {}) {
    if (!db || !redis || !emit) throw Error('DeliveryStream requires db, redis and emit');
    this.db = db;
    this.redis = redis;
    this.emit = emit;
    this.logger = logger;
    this.stream = stream;
    this.group = group;
    this.consumer = consumer;
    this.batchSize = batchSize;
    this.claimIdleMs = claimIdleMs;
    this.reconcileIntervalMs = reconcileIntervalMs;
    this.pendingCursor = '0-0';
    this.claimCursor = '0-0';
    this.reconcileCursor = '';
    this.nextReconcile = 0;
    this.groupReady = false;
    this.inFlight = null;
    this.lastSuccessAt = null;
    this.lastErrorAt = null;
  }

  command(...args) {
    return this.redis.sendCommand(args.map(String), {abortSignal: AbortSignal.timeout(5000)});
  }

  async ensureGroup() {
    if (this.groupReady) return;
    let created = false;
    try {
      await this.command('XGROUP', 'CREATE', this.stream, this.group, '0', 'MKSTREAM');
      created = true;
    } catch (error) {
      if (!error.message?.startsWith('BUSYGROUP')) throw error;
    }
    // A new group may follow a lost Redis volume. Rebuild all still-active work
    // from the SQL outbox. Existing Redis messages may be replayed; that is safe.
    if (created) {
      await this.db.query(`UPDATE deliveries SET stream_id=NULL,stream_enqueued_at=NULL
        WHERE status IN ${ACTIVE}`);
    }
    this.groupReady = true;
  }

  async publishOutbox() {
    return this.db.tx(async tx => {
      const batch = await rows(tx, `SELECT d.* FROM deliveries d JOIN screens s ON s.id=d.screen_id
        WHERE d.stream_id IS NULL AND d.status IN ${ACTIVE}
          AND s.enabled=true AND s.desired_release=d.release_id
        ORDER BY d.id LIMIT $1 FOR UPDATE OF d SKIP LOCKED`, [this.batchSize]);
      for (const d of batch) {
        // Never set MAXLEN here. XACK + XDEL retire only terminal entries.
        const id = await this.command('XADD', this.stream, '*',
          'schemaVersion', '1', 'deliveryId', d.id, 'screenId', d.screen_id, 'releaseId', d.release_id);
        await tx.query('UPDATE deliveries SET stream_id=$2,stream_enqueued_at=now() WHERE id=$1', [d.id, id]);
      }
      return batch.length;
    });
  }

  async reconcileMissingEntries() {
    const batch = await rows(this.db, `SELECT d.id,d.stream_id FROM deliveries d JOIN screens s ON s.id=d.screen_id
      WHERE d.stream_id IS NOT NULL AND d.status IN ${ACTIVE}
        AND s.enabled=true AND s.desired_release=d.release_id AND d.id>$1
      ORDER BY d.id LIMIT $2`, [this.reconcileCursor, this.batchSize]);
    for (const d of batch) {
      const entry = await this.command('XRANGE', this.stream, d.stream_id, d.stream_id);
      const body = fieldsOf(entry?.[0]?.[1]);
      if (body?.deliveryId !== d.id) {
        await this.db.query(`UPDATE deliveries SET stream_id=NULL,stream_enqueued_at=NULL
          WHERE id=$1 AND stream_id=$2 AND status IN ${ACTIVE}`, [d.id, d.stream_id]);
      }
    }
    this.reconcileCursor = batch.length === this.batchSize ? batch.at(-1).id : '';
    // Scan a bounded page per tick until the whole outbox is checked.
    this.nextReconcile = this.reconcileCursor ? 0 : Date.now() + this.reconcileIntervalMs;
    return batch.length;
  }

  async retire(entryId, invalidReason = null) {
    if (invalidReason) {
      await this.command('EVAL', QUARANTINE_ENTRY, 2, this.stream, `${this.stream}:dead`,
        this.group, entryId, invalidReason);
      this.logger?.warn({entryId, reason: invalidReason}, 'Invalid delivery stream entry quarantined');
    } else {
      await this.command('EVAL', REMOVE_ENTRY, 1, this.stream, this.group, entryId);
    }
  }

  async processEntry([entryId, rawFields]) {
    const message = fieldsOf(rawFields);
    if (!message || message.schemaVersion !== '1' || !message.deliveryId || !message.screenId || !message.releaseId) {
      await this.retire(entryId, 'Invalid delivery envelope');
      return;
    }
    const d = await one(this.db, `SELECT d.*,s.enabled,s.desired_release FROM deliveries d
      JOIN screens s ON s.id=d.screen_id WHERE d.id=$1`, [message.deliveryId]);
    if (!d || d.screen_id !== message.screenId || d.release_id !== message.releaseId) {
      await this.retire(entryId, 'Unknown or mismatched delivery identity');
      return;
    }
    if (d.status === 'applied' || d.status === 'superseded' || !d.enabled || d.desired_release !== d.release_id) {
      // Cancelled/disabled entries are retired without setting Applied in SQL.
      await this.retire(entryId);
      return;
    }
    // The SQL compare-and-update prevents duplicate stream entries or workers
    // from issuing concurrent retries. Redis delivery alone is never an ACK.
    const due = await one(this.db, `UPDATE deliveries d SET attempts=attempts+1,
        next_attempt=now()+(LEAST(300,5*power(2,LEAST(d.attempts,6))) * interval '1 second'),updated_at=now()
      FROM screens s WHERE d.id=$1 AND s.id=d.screen_id AND s.enabled=true
        AND s.desired_release=d.release_id AND d.status IN ${ACTIVE} AND d.next_attempt<=now()
      RETURNING d.id,d.screen_id,d.release_id`, [d.id]);
    if (due) await this.emit(due.screen_id, {deliveryId: due.id, releaseId: due.release_id});
    // Leave the message in the pending-entry list until the TV's Applied ACK
    // has committed to PostgreSQL. The next pass retires it with XACK.
  }

  async runCycle() {
    if (!this.redis.isReady) throw Error('Redis delivery stream is unavailable');
    try {
      await this.ensureGroup();
      if (Date.now() >= this.nextReconcile) await this.reconcileMissingEntries();
      const published = await this.publishOutbox();
      const claimed = await this.command('XAUTOCLAIM', this.stream, this.group, this.consumer,
        this.claimIdleMs, this.claimCursor, 'COUNT', this.batchSize);
      this.claimCursor = claimed[0];
      const pending = await this.command('XREADGROUP', 'GROUP', this.group, this.consumer,
        'COUNT', this.batchSize, 'STREAMS', this.stream, this.pendingCursor);
      const pendingEntries = pending?.[0]?.[1] || [];
      this.pendingCursor = pendingEntries.length === this.batchSize ? pendingEntries.at(-1)[0] : '0-0';
      const fresh = await this.command('XREADGROUP', 'GROUP', this.group, this.consumer,
        'COUNT', this.batchSize, 'STREAMS', this.stream, '>');
      const unique = new Map([...(claimed[1] || []), ...pendingEntries, ...(fresh?.[0]?.[1] || [])]);
      for (const entry of unique) await this.processEntry(entry);
      this.lastSuccessAt = new Date().toISOString();
      return {published, processed: unique.size};
    } catch (error) {
      this.lastErrorAt = new Date().toISOString();
      if (error.message?.includes('NOGROUP')) {
        this.groupReady = false;
        this.pendingCursor = this.claimCursor = '0-0';
      }
      throw error;
    }
  }

  tick() {
    if (!this.inFlight) this.inFlight = this.runCycle().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async stop() { await this.inFlight?.catch(() => {}); }
}
