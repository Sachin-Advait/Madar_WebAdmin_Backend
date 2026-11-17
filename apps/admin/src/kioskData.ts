/* eslint-disable @typescript-eslint/no-explicit-any */
// SpaceHub TV (meeting board) and ServeIQ TV (queue board) in the Page
// Builder. They are only offered for Meeting Management and Queue Management
// profiles. UI only for now: sections, settings and published versions are
// kept in this browser, and the preview shows sample data.
import type {
  Catalog,
  LayoutResponse,
  LayoutSection,
  PageLayout,
} from "./types";

export const SPACEHUB_PAGE = "spacehub_tv";
export const SERVEIQ_PAGE = "serveiq_tv";
export type KioskPage = typeof SPACEHUB_PAGE | typeof SERVEIQ_PAGE;

/** The board page each kiosk profile type builds, and the reverse. */
export const KIOSK_PAGE_OF: Record<string, KioskPage> = {
  meeting: SPACEHUB_PAGE,
  queue: SERVEIQ_PAGE,
};
export const isKioskPage = (page: string): page is KioskPage =>
  page === SPACEHUB_PAGE || page === SERVEIQ_PAGE;

type Def = {
  label: string;
  page: KioskPage;
  width?: number;
  defaults: Record<string, unknown>;
  schema: Record<string, any>;
};

const title = (t: string) => ({
  type: "string",
  title: "Section title",
  default: t,
});
const header = {
  type: "object",
  properties: {
    showDate: {
      type: "boolean",
      title: "Show the date under the clock",
      default: true,
    },
  },
};
const ticker = {
  type: "object",
  properties: {
    text: { type: "string", title: "Ticker text (English)" },
    textAr: { type: "string", title: "Ticker text (Arabic)" },
  },
};
const video = {
  type: "object",
  properties: {
    label: { type: "string", title: "Playlist name" },
    // The videos are chosen with the picker under the form.
    height: {
      type: "string",
      title: "Height",
      enum: ["compact", "standard", "large"],
      default: "standard",
    },
  },
};
const tickerDefaults = {
  text: "Welcome to the Ministry · Please keep your token ready · Thank you for your patience",
  textAr: "مرحباً بكم · يرجى الاحتفاظ بالتذكرة · شكراً لصبركم",
};

const DEFS: Record<string, Def> = {
  sh_header: {
    label: "Header & clock",
    page: SPACEHUB_PAGE,
    defaults: { showDate: true },
    schema: header,
  },
  sh_room_status: {
    label: "Room status (Free · Busy · Upcoming)",
    page: SPACEHUB_PAGE,
    defaults: {},
    schema: { type: "object", properties: {} },
  },
  sh_rooms: {
    label: "Rooms (current meetings)",
    page: SPACEHUB_PAGE,
    defaults: { title: "Rooms", showDepartment: false },
    schema: {
      type: "object",
      properties: {
        title: title("Rooms"),
        showDepartment: {
          type: "boolean",
          title: "Show the department instead of capacity",
        },
      },
    },
  },
  sh_upcoming: {
    label: "Upcoming meetings",
    page: SPACEHUB_PAGE,
    defaults: { title: "Upcoming", showDepartment: false },
    schema: {
      type: "object",
      properties: {
        title: title("Upcoming"),
        showDepartment: {
          type: "boolean",
          title: "Show the department instead of capacity",
        },
      },
    },
  },
  sh_counters: {
    label: "Counters",
    page: SPACEHUB_PAGE,
    defaults: { title: "Counters" },
    schema: { type: "object", properties: { title: title("Counters") } },
  },
  sh_videos: {
    label: "Video carousel",
    page: SPACEHUB_PAGE,
    defaults: { label: "Welcome video", height: "standard", videoIds: [] },
    schema: video,
  },
  sh_ticker: {
    label: "News ticker",
    page: SPACEHUB_PAGE,
    defaults: tickerDefaults,
    schema: ticker,
  },
  sq_header: {
    label: "Header & clock",
    page: SERVEIQ_PAGE,
    defaults: { showDate: true },
    schema: header,
  },
  sq_now_calling: {
    label: "Now calling",
    page: SERVEIQ_PAGE,
    defaults: {
      title: "NOW CALLING",
      titleAr: "النداء الحالي",
      walkSeconds: 30,
    },
    schema: {
      type: "object",
      properties: {
        title: title("NOW CALLING"),
        titleAr: { type: "string", title: "Arabic title" },
        walkSeconds: {
          type: "integer",
          title: "Seconds to reach the counter",
          minimum: 5,
          maximum: 120,
        },
      },
    },
  },
  sq_counters: {
    label: "Current counters",
    page: SERVEIQ_PAGE,
    width: 8,
    defaults: { title: "Current Counters" },
    schema: {
      type: "object",
      properties: { title: title("Current Counters") },
    },
  },
  sq_upcoming: {
    label: "Upcoming tokens",
    page: SERVEIQ_PAGE,
    width: 4,
    defaults: { title: "Upcoming", showHold: true },
    schema: {
      type: "object",
      properties: {
        title: title("Upcoming"),
        showHold: { type: "boolean", title: "Show tokens on hold" },
      },
    },
  },
  sq_videos: {
    label: "Video carousel",
    page: SERVEIQ_PAGE,
    defaults: { label: "Welcome video", height: "standard", videoIds: [] },
    schema: video,
  },
  sq_ticker: {
    label: "News ticker",
    page: SERVEIQ_PAGE,
    defaults: tickerDefaults,
    schema: ticker,
  },
};

export const isKioskType = (type: string) => type in DEFS;
export const isKioskVideoType = (type: string) =>
  type === "sh_videos" || type === "sq_videos";
/** Grid columns (of 12) a board section takes on the portrait canvas. */
export const kioskWidth = (type: string) => DEFS[type]?.width ?? 12;

export const KIOSK_PAGE_NAMES: Record<KioskPage, string> = {
  [SPACEHUB_PAGE]: "SpaceHub TV / Meeting Management board",
  [SERVEIQ_PAGE]: "ServeIQ TV / Queue Management board",
};

/** Adds the two boards and their widgets to the Page Builder catalog. */
export function withKioskBoards(c: Catalog): Catalog {
  if (c.pages[SPACEHUB_PAGE]) return c;
  const widgets: any = { ...c.widgets };
  Object.entries(DEFS).forEach(([type, d]) => {
    widgets[type] = {
      type,
      label: d.label,
      icon: "",
      grid: false,
      source: "sample data (UI only)",
      defaults: d.defaults,
      schema: d.schema,
    };
  });
  const typesOf = (page: KioskPage) =>
    Object.entries(DEFS)
      .filter(([, d]) => d.page === page)
      .map(([k]) => k);
  return {
    ...c,
    pages: { ...c.pages, ...KIOSK_PAGE_NAMES },
    pageWidgets: {
      ...c.pageWidgets,
      [SPACEHUB_PAGE]: typesOf(SPACEHUB_PAGE),
      [SERVEIQ_PAGE]: typesOf(SERVEIQ_PAGE),
    },
    widgets,
  };
}

/** The board a profile starts with, in the same order as the TV app. */
export function defaultKioskLayout(page: KioskPage): PageLayout {
  return {
    schemaVersion: 1,
    pageKey: page,
    sections: Object.entries(DEFS)
      .filter(([, d]) => d.page === page)
      .map(([type, d], i) => ({
        id: `${type}-main`,
        type,
        enabled: true,
        order: i,
        props: { ...d.defaults },
        layout: { x: 0, y: i * 4, w: d.width ?? 12, h: 4 },
      })),
  };
}

/* ───────────── browser storage in place of the API ───────────── */

type Stored = {
  draft: LayoutSection[];
  published: LayoutSection[] | null;
  revision: number;
  publishedVersion: number;
  updatedAt: string;
  versions: {
    version: number;
    publishedAt: string;
    publishedBy: string;
    sections: LayoutSection[];
  }[];
};
const memory: Record<string, Stored> = {};
const key = (page: string, profile: string) => `madar.board.${page}.${profile}`;

function load(page: KioskPage, profile: string): Stored {
  const k = key(page, profile);
  try {
    const raw = localStorage.getItem(k);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable: fall back to memory */
  }
  if (memory[k]) return memory[k];
  const sections = defaultKioskLayout(page).sections;
  const now = new Date().toISOString();
  return {
    draft: sections,
    published: sections,
    revision: 1,
    publishedVersion: 1,
    updatedAt: now,
    versions: [
      { version: 1, publishedAt: now, publishedBy: "initialization", sections },
    ],
  };
}
function store(page: KioskPage, profile: string, s: Stored) {
  const k = key(page, profile);
  memory[k] = s;
  try {
    localStorage.setItem(k, JSON.stringify(s));
  } catch {
    /* kept in memory for this visit */
  }
}
const asLayout = (page: string, sections: LayoutSection[]): PageLayout => ({
  schemaVersion: 1,
  pageKey: page,
  sections,
});
const conflict = () =>
  Promise.reject(
    new Error(
      "This board changed in another tab. Reload the page and try again.",
    ),
  );

export const kioskApi = {
  layout: async (page: KioskPage, profile: string): Promise<LayoutResponse> => {
    const s = load(page, profile);
    return {
      pageKey: page,
      profileId: profile,
      draft: asLayout(page, s.draft),
      published: s.published ? asLayout(page, s.published) : null,
      revision: s.revision,
      publishedVersion: s.publishedVersion,
      updatedAt: s.updatedAt,
    };
  },
  saveLayout: async (
    page: KioskPage,
    profile: string,
    layout: PageLayout,
    revision: number,
  ) => {
    const s = load(page, profile);
    if (s.revision !== revision) return conflict();
    const next = {
      ...s,
      draft: layout.sections,
      revision: s.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    store(page, profile, next);
    return { revision: next.revision };
  },
  publish: async (page: KioskPage, profile: string, revision: number) => {
    const s = load(page, profile);
    if (s.revision !== revision) return conflict();
    const version = s.publishedVersion + 1;
    const now = new Date().toISOString();
    store(page, profile, {
      ...s,
      published: s.draft,
      publishedVersion: version,
      updatedAt: now,
      versions: [
        { version, publishedAt: now, publishedBy: "you", sections: s.draft },
        ...s.versions,
      ].slice(0, 20),
    });
    return { publishedVersion: version };
  },
  versions: async (page: KioskPage, profile: string) =>
    load(page, profile).versions.map(
      ({ version, publishedAt, publishedBy }) => ({
        version,
        publishedAt,
        publishedBy,
      }),
    ),
  rollback: async (
    page: KioskPage,
    profile: string,
    version: number,
    revision: number,
  ) => {
    const s = load(page, profile);
    if (s.revision !== revision) return conflict();
    const v = s.versions.find((x) => x.version === version);
    if (!v) throw new Error("That version is no longer kept in this browser.");
    store(page, profile, {
      ...s,
      draft: v.sections,
      revision: s.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
};
