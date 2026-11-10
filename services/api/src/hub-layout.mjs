// The Info Hub screen built in the admin Page Builder (page "info_hub").
//
// The admin arranges one card per Info Hub section (Meeting Rooms, Queue
// Management, ...) across the four TV tabs, hides or duplicates them and sets
// each card's title, subtitle and badge. It is stored like any other page in
// the `layouts` table, and when it is published it decides, per profile:
// - which sections each Info Hub tab shows on TVs, and in what order;
// - the heading, subtitle and badge of each section panel;
// - whether Work & Support shows Help Desk, Daily Tasks or both.
// It is not one of the catalog pages, so it never appears as a TV destination,
// a schedule target or a profile permission; the "info-hub" permission covers it.

export const HUB_LAYOUT_PAGE = 'info_hub';

/** Section card types, in default order, with the TV page each one shows. */
export const hubWidgets = {
  hub_meeting_rooms: {page: 'info-meetings', tab: 'live', label: 'Meeting Rooms', defaults: {title: 'Meeting Rooms', subtitle: 'Room availability & upcoming schedule', badge: 'Today'}},
  hub_queue_management: {page: 'info-queue', tab: 'live', label: 'Queue Management', defaults: {title: 'Queue Management', subtitle: 'Service activity & current calls', badge: 'Reception'}},
  hub_priority_alerts: {page: 'info-alerts', tab: 'live', wide: true, label: 'Priority Alerts', defaults: {title: 'Priority Alerts'}},
  hub_official_notices: {page: 'info-notices', tab: 'news', label: 'Official Notices', defaults: {title: 'Official Notices', subtitle: 'Latest approved announcements'}},
  hub_events_training: {page: 'info-events', tab: 'news', label: 'Events & Training', defaults: {title: 'Events & Training', subtitle: 'What is coming up'}},
  hub_media_highlights: {page: 'info-media', tab: 'news', label: 'Media Highlights', defaults: {title: 'Media Highlights', subtitle: 'People, stories & achievements'}},
  hub_services_information: {page: 'info-services', tab: 'services', label: 'Services & Information', defaults: {title: 'Services & Information', subtitle: 'What you need & where to go'}},
  hub_visitor_guide: {page: 'info-visitor', tab: 'services', label: 'Visitor Guide', defaults: {title: 'Visitor Guide', subtitle: 'Building access & useful contacts'}},
  hub_helpdesk_summary: {page: 'info-helpdesk', tab: 'work', work: 'work_helpdesk', label: 'Helpdesk', defaults: {title: 'Helpdesk', subtitle: 'Tickets created today'}},
  hub_task_summary: {page: 'info-tasks', tab: 'work', work: 'work_tasks', label: 'Tasks', defaults: {title: 'Tasks', subtitle: 'Tasks due today'}},
};

const fail = message => { throw Object.assign(new Error(message), {status: 422}); };

/** The layout every profile starts with: all ten sections, as TVs show them today. */
export function defaultHubLayout() {
  return {
    schemaVersion: 1,
    pageKey: HUB_LAYOUT_PAGE,
    sections: Object.entries(hubWidgets).map(([type, w], i) => ({
      id: `${type}-main`, type, enabled: true, order: i,
      props: {...w.defaults},
      layout: {x: 0, y: i * 4, w: w.wide ? 12 : 6, h: 4},
    })),
  };
}

const PROP_KEYS = ['title', 'subtitle', 'badge'];

export function validateHubLayout(l) {
  if (!(l && l.schemaVersion === 1 && l.pageKey === HUB_LAYOUT_PAGE && Array.isArray(l.sections) && l.sections.length <= 40)) fail('Invalid page layout');
  const ids = new Set();
  const sections = l.sections.map((s, i) => {
    if (!s || typeof s !== 'object') fail('Invalid section');
    if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id)) fail('Each section needs its own ID');
    ids.add(s.id);
    if (!hubWidgets[s.type]) fail(`Section type ${s.type} is not allowed on the Info Hub`);
    if (typeof s.enabled !== 'boolean') fail('Section visibility must be on or off');
    const props = s.props ?? {};
    if (typeof props !== 'object' || Array.isArray(props)) fail('Invalid section settings');
    for (const k of Object.keys(props)) {
      if (!PROP_KEYS.includes(k)) fail(`Unknown setting ${k} on ${s.type}`);
      if (props[k] !== undefined && (typeof props[k] !== 'string' || props[k].length > 120)) fail(`${k} must be text of at most 120 characters`);
    }
    const g = s.layout ?? {};
    const int = v => Number.isInteger(v) && v >= 0 && v <= 100;
    if (!int(g.x) || !int(g.y) || !int(g.w) || !int(g.h) || g.w < 1 || g.w > 12 || g.h < 1) fail('Invalid section position');
    return {id: s.id, type: s.type, enabled: s.enabled, order: i, props: Object.fromEntries(PROP_KEYS.filter(k => typeof props[k] === 'string').map(k => [k, props[k]])), layout: {x: g.x, y: g.y, w: g.w, h: g.h}};
  });
  return {schemaVersion: 1, pageKey: HUB_LAYOUT_PAGE, sections};
}

/**
 * Applies a published Info Hub layout to resolved TV experience settings.
 * `allowed(page)` says whether the profile may show a TV page.
 * Returns the new settings and the Work & Support page for the release bundle
 * (null when the layout leaves Work & Support empty).
 */
export function applyHubLayout(experience, layout, allowed = () => true) {
  if (!layout || !Array.isArray(layout.sections)) return {experience, workPage: null};
  const shown = layout.sections
    .filter(s => s.enabled && hubWidgets[s.type] && allowed(hubWidgets[s.type].page))
    .sort((a, b) => a.order - b.order);
  const hubPanels = {};
  for (const s of shown) {
    const page = hubWidgets[s.type].page;
    if (hubPanels[page]) continue;
    const p = {};
    for (const k of PROP_KEYS) if (typeof s.props?.[k] === 'string' && s.props[k].trim()) p[k] = s.props[k].trim();
    hubPanels[page] = p;
  }
  const unique = list => [...new Set(list)];
  const hubGroups = experience.hubGroups.map(g => {
    const own = shown.filter(s => hubWidgets[s.type].tab === g.id);
    if (g.id === 'work') return {...g, pages: own.length ? ['info-work'] : [], banners: [], builder: true};
    return {
      ...g,
      pages: unique(own.filter(s => !hubWidgets[s.type].wide).map(s => hubWidgets[s.type].page)),
      banners: unique(own.filter(s => hubWidgets[s.type].wide).map(s => hubWidgets[s.type].page)),
      builder: true,
    };
  });
  // Work & Support: Help Desk and/or Daily Tasks, side by side, in the builder's order.
  const work = [];
  for (const s of shown) {
    const w = hubWidgets[s.type];
    if (!w.work || work.some(x => x.type === w.work)) continue;
    work.push({id: `${w.work}-${work.length + 1}`, type: w.work, order: work.length, enabled: true, props: {title: hubPanels[w.page].title || w.defaults.title, ...(hubPanels[w.page].subtitle ? {subtitle: hubPanels[w.page].subtitle} : {})}});
  }
  work.forEach((s, i) => { s.layout = {x: work.length === 1 ? 0 : i * 6, y: 0, w: work.length === 1 ? 12 : 6, h: s.type === 'work_tasks' ? 8 : 6}; });
  return {
    experience: {...experience, hubGroups, hubPanels},
    workPage: work.length ? {schemaVersion: 1, pageKey: 'info-work', sections: work} : null,
  };
}
