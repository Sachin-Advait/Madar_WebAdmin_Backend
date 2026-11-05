/* eslint-disable @typescript-eslint/no-explicit-any */
import type { API } from "./api";
import type { Catalog, LayoutSection, PageLayout } from "./types";

type LayoutResponse = Awaited<ReturnType<typeof API.layout>>;
type VersionsResponse = Awaited<ReturnType<typeof API.versions>>;

export const HUB_PAGE = "info_hub";

export const HUB_TABS = [
  { id: "live", label: "Live Status" },
  { id: "news", label: "News & Events" },
  { id: "services", label: "Services & Guide" },
  { id: "work", label: "Work & Support" },
] as const;
export type HubTabId = (typeof HUB_TABS)[number]["id"];

type Def = {
  label: string;
  tab: HubTabId;
  source: string;
  wide?: boolean;
  defaults: Record<string, unknown>;
};

const DEFS: Record<string, Def> = {
  hub_meeting_rooms: {
    label: "Meeting Rooms",
    tab: "live",
    source: "/api/info-hub/meeting-rooms",
    defaults: {
      title: "Meeting Rooms",
      subtitle: "Room availability & upcoming schedule",
      badge: "Today",
    },
  },
  hub_queue_management: {
    label: "Queue Management",
    tab: "live",
    source: "/api/info-hub/queue",
    defaults: {
      title: "Queue Management",
      subtitle: "Service activity & current calls",
      badge: "Reception",
    },
  },
  hub_priority_alerts: {
    label: "Priority Alerts",
    tab: "live",
    source: "/api/info-hub/alerts",
    wide: true,
    defaults: { title: "Priority Alerts" },
  },
  hub_official_notices: {
    label: "Official Notices",
    tab: "news",
    source: "/api/info-hub/notices",
    defaults: {
      title: "Official Notices",
      subtitle: "Latest approved announcements",
    },
  },
  hub_events_training: {
    label: "Events & Training",
    tab: "news",
    source: "/api/info-hub/events",
    defaults: { title: "Events & Training", subtitle: "What is coming up" },
  },
  hub_media_highlights: {
    label: "Media Highlights",
    tab: "news",
    source: "/api/info-hub/media",
    defaults: {
      title: "Media Highlights",
      subtitle: "People, stories & achievements",
    },
  },
  hub_services_information: {
    label: "Services & Information",
    tab: "services",
    source: "/api/info-hub/services",
    defaults: {
      title: "Services & Information",
      subtitle: "What you need & where to go",
    },
  },
  hub_visitor_guide: {
    label: "Visitor Guide",
    tab: "services",
    source: "/api/info-hub/visitor-guide",
    defaults: {
      title: "Visitor Guide",
      subtitle: "Building access & useful contacts",
    },
  },
  hub_helpdesk_summary: {
    label: "Helpdesk",
    tab: "work",
    source: "/api/info-hub/helpdesk",
    defaults: { title: "Helpdesk", subtitle: "Tickets created today" },
  },
  hub_task_summary: {
    label: "Tasks",
    tab: "work",
    source: "/api/info-hub/tasks",
    defaults: { title: "Tasks", subtitle: "Tasks due today" },
  },
};

export const HUB_TAB_OF: Record<string, HubTabId> = Object.fromEntries(
  Object.entries(DEFS).map(([k, v]) => [k, v.tab]),
);
export const HUB_WIDE: Record<string, boolean> = Object.fromEntries(
  Object.entries(DEFS).map(([k, v]) => [k, !!v.wide]),
);
export const isHubType = (type: string) => type in DEFS;

const schema = {
  type: "object",
  properties: {
    title: { type: "string", title: "Title" },
    subtitle: { type: "string", title: "Subtitle" },
    badge: { type: "string", title: "Badge" },
  },
};

export function withInfoHub(c: Catalog): Catalog {
  if (c.pages[HUB_PAGE]) return c;
  const widgets: any = { ...c.widgets };
  Object.entries(DEFS).forEach(([type, d]) => {
    widgets[type] = {
      label: d.label,
      source: d.source,
      defaults: d.defaults,
      schema,
    };
  });
  return {
    ...c,
    pages: {
      ...c.pages,
      [HUB_PAGE]: "Info Hub / Live status, news, services & support",
    },
    pageWidgets: { ...c.pageWidgets, [HUB_PAGE]: Object.keys(DEFS) },
    widgets,
  };
}

/* ───────────── content ───────────── */

export const HUB_DATA: Record<string, any> = {
  hub_meeting_rooms: {
    meetingsToday: 12,
    inProgress: 2,
    available: 3,
    rooms: [
      {
        name: "Meeting A",
        detail: "Operations review · 08:30–09:30",
        status: "occupied",
      },
      {
        name: "Meeting B",
        detail: "Service briefing · 08:00–09:00",
        status: "occupied",
      },
      {
        name: "Meeting C",
        detail: "Next: Project planning · 09:45",
        status: "available",
      },
      {
        name: "Training 1 · Al Majd",
        detail: "No meeting in progress",
        status: "available",
      },
    ],
  },
  hub_queue_management: {
    served: 86,
    waiting: 12,
    counters: 4,
    calling: [
      { ticket: "P041", counter: "Counter 02" },
      { ticket: "S018", counter: "Counter 01" },
      { ticket: "P040", counter: "Counter 04" },
    ],
  },
  hub_priority_alerts: {
    message:
      "East entrance maintenance until 12:00. Please use the main entrance and accessible ramp.",
  },
  hub_official_notices: {
    items: [
      {
        dept: "ADMINISTRATION",
        date: "05 NOV",
        title: "Updated document collection hours",
        body: "Collect approved documents at the ground-floor service desk, Sunday to Thursday, 07:30–14:30. Bring your identification and application reference.",
        ref: "ADM-2026-94",
      },
      {
        dept: "IT SERVICES",
        date: "04 NOV",
        title: "Scheduled portal maintenance",
        body: "The staff portal will be unavailable on Friday, 22:00–23:00. Please save your work before maintenance begins.",
        ref: "IT-2026-082",
      },
    ],
    footer: ["2 latest notices", "Approved content"],
  },
  hub_events_training: {
    items: [
      {
        day: "08",
        month: "NOV",
        title: "Customer service workshop",
        meta: "10:00–12:00 · Training 1",
        audience: "Service teams · HR Department",
      },
      {
        day: "10",
        month: "NOV",
        title: "Information security briefing",
        meta: "09:00–10:00 · Al Majd",
        audience: "All employees · IT Department",
      },
    ],
    footer: ["Next 2 events", "November"],
  },
  hub_media_highlights: {
    tag: "PEOPLE & SERVICE",
    title: "A week of better service",
    body: "Meet the teams behind our reception improvements and the new visitor guidance programme.",
    meta: "Communications · 03 Nov",
    next: {
      title: "New service centre walkthrough",
      meta: "Visitor guidance · 2 min video",
    },
    footer: ["Featured story", "Editorial content"],
  },
  hub_services_information: {
    items: [
      {
        title: "Pension enquiries",
        body: "Bring your identification and application reference. Our team can help with application status and supporting documents.",
        location: "Ground floor · Counters 01–03",
        extension: "Extension 1201",
        hours: "Sun–Thu · 07:30–14:30",
      },
      {
        title: "Document collection",
        body: "Bring your identification and collection notification. Representatives should bring the required authorization.",
        location: "Ground floor · Counter 04",
        extension: "Extension 1202",
        hours: "Sun–Thu · 07:30–14:30",
      },
    ],
  },
  hub_visitor_guide: {
    items: [
      {
        badge: "G",
        icon: "building",
        title: "Reception & service counters",
        detail: "Main entrance · Ground floor",
      },
      {
        badge: "1",
        icon: "door",
        title: "Meeting rooms A, B & C",
        detail: "First floor · Use the central lift",
      },
      {
        badge: "2",
        icon: "calendar",
        title: "Al Majd & Training 1",
        detail: "Second floor · Follow meeting signs",
      },
      {
        icon: "access",
        title: "Accessible route",
        detail:
          "Main entrance ramp and central lift. Reception can assist with step-free access.",
      },
      {
        icon: "help",
        title: "Need assistance?",
        detail: "Speak to reception · Extension 1200",
      },
    ],
  },
  hub_helpdesk_summary: {
    today: { total: 24, resolved: 18, pending: 6, progress: 75 },
    week: { total: 131, resolved: 118, pending: 13, progress: 90 },
    footer: ["IT & Facilities", "Summary only"],
  },
  hub_task_summary: {
    today: {
      total: 12,
      finished: 7,
      pending: 5,
      footer: ["1–5 of 5 pending", "All pending tasks shown"],
    },
    week: {
      total: 48,
      finished: 39,
      pending: 9,
      footer: ["1–5 of 9 pending", "Earliest five shown"],
    },
    tasks: [
      {
        title: "Inspect lobby display",
        owner: "Ahmed Al Balushi",
        priority: "High",
        due: "09:00",
      },
      {
        title: "Prepare visitor welcome content",
        owner: "Sara Al Harthy",
        priority: "High",
        due: "10:30",
      },
      {
        title: "Test meeting room audio",
        owner: "Ali Al Saadi",
        priority: "Normal",
        due: "11:00",
      },
      {
        title: "Update service desk guide",
        owner: "Mariam Al Hinai",
        priority: "Normal",
        due: "12:00",
      },
      {
        title: "Review reception signage",
        owner: "Khalid Al Rashdi",
        priority: "Normal",
        due: "13:30",
      },
    ],
  },
};

/* ───────────── layout store ───────────── */

type Version = {
  version: number;
  publishedAt: string;
  sections: LayoutSection[];
};
type Saved = {
  draft: LayoutSection[];
  revision: number;
  publishedVersion: number;
  versions: Version[];
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 180));
const mem: Record<string, Saved> = {};
const key = (p: string) => `infohub:layout:${p}`;

function seed(): Saved {
  const sections: LayoutSection[] = Object.entries(DEFS).map(
    ([type, d], i) => ({
      id: `${type}-main`,
      type,
      enabled: true,
      order: i,
      props: { ...d.defaults },
      layout: { x: 0, y: i * 4, w: d.wide ? 12 : 6, h: 4 },
    }),
  );
  return {
    draft: sections,
    revision: 1,
    publishedVersion: 1,
    versions: [
      {
        version: 1,
        publishedAt: new Date().toISOString(),
        sections: clone(sections),
      },
    ],
  };
}
function read(profile: string): Saved {
  if (mem[profile]) return mem[profile];
  try {
    const raw = localStorage.getItem(key(profile));
    if (raw) return (mem[profile] = JSON.parse(raw));
  } catch {
    /* storage unavailable */
  }
  return (mem[profile] = seed());
}
function commit(profile: string, s: Saved) {
  mem[profile] = s;
  try {
    localStorage.setItem(key(profile), JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export const hubApi = {
  layout: (profile: string) => {
    const s = read(profile);
    return wait({
      draft: {
        schemaVersion: 1,
        pageKey: HUB_PAGE,
        sections: clone(s.draft),
      },
      revision: s.revision,
      publishedVersion: s.publishedVersion,
    } as unknown as LayoutResponse);
  },
  versions: (profile: string) =>
    wait(
      read(profile).versions.map(({ version, publishedAt }) => ({
        version,
        publishedAt,
      })) as unknown as VersionsResponse,
    ),
  saveLayout: (profile: string, layout: PageLayout, _revision?: number) => {
    const s = clone(read(profile));
    s.draft = clone(layout.sections);
    s.revision += 1;
    commit(profile, s);
    return wait({ revision: s.revision });
  },
  publish: (profile: string, _revision?: number) => {
    const s = clone(read(profile));
    s.publishedVersion += 1;
    s.versions.unshift({
      version: s.publishedVersion,
      publishedAt: new Date().toISOString(),
      sections: clone(s.draft),
    });
    commit(profile, s);
    return wait({ publishedVersion: s.publishedVersion });
  },
  rollback: (profile: string, version: number, _revision?: number) => {
    const s = clone(read(profile));
    const v = s.versions.find((x) => x.version === version);
    if (v) {
      s.draft = clone(v.sections);
      s.revision += 1;
      commit(profile, s);
    }
    return wait({ revision: s.revision });
  },
};
