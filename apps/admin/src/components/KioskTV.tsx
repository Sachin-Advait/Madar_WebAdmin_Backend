// Page Builder preview of the SpaceHub TV (meeting board) and ServeIQ TV
// (queue board), drawn to match those Flutter apps: portrait 1024 × 1536
// design, sizes in design pixels via --u. Sample data only.
import React, { useEffect, useState } from "react";
import "../kiosk.css";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Play,
  Timer,
  Users,
} from "lucide-react";
import type { LayoutSection } from "../types";
import { SPACEHUB_PAGE, type KioskPage } from "../kioskData";

const ICON = "/kiosk/";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** A PNG icon from the app, tinted like Flutter's Image.asset(color:). */
function Glyph({
  name,
  size,
  color,
}: {
  name: string;
  size: number;
  color: string;
}) {
  return (
    <span
      className="kiosk-glyph"
      style={
        {
          "--glyph": `url(${ICON}${name}.png)`,
          "--size": size,
          background: color,
        } as React.CSSProperties
      }
    />
  );
}

export function KioskFrame({
  page,
  children,
}: {
  page: KioskPage;
  children: React.ReactNode;
}) {
  const spacehub = page === SPACEHUB_PAGE;
  return (
    <div className={`kiosk-frame ${spacehub ? "is-spacehub" : "is-serveiq"}`}>
      <span className="kiosk-sample">
        {spacehub ? "SPACEHUB TV" : "SERVEIQ TV"} · SAMPLE DATA
      </span>
      {children}
    </div>
  );
}

/* ───────────── shared ───────────── */

function Header({
  section,
  serveiq,
}: {
  section: LayoutSection;
  serveiq: boolean;
}) {
  const now = useClock();
  return (
    <div className={`kiosk-header ${serveiq ? "sq" : "sh"}`}>
      <img src={`${ICON}logo.png`} alt="" />
      <div>
        <strong>
          {now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </strong>
        {section.props.showDate !== false && (
          <small>
            {now.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </small>
        )}
      </div>
    </div>
  );
}

function Ticker({
  section,
  serveiq,
}: {
  section: LayoutSection;
  serveiq: boolean;
}) {
  const items = String(section.props.text || "")
    .split("·")
    .map((x) => x.trim())
    .filter(Boolean);
  const run = (
    <span className="kiosk-ticker-run">
      {items.map((t, i) => (
        <React.Fragment key={i}>
          <img src={`${ICON}ticker_arrow.png`} alt="" />
          <span>{t}</span>
        </React.Fragment>
      ))}
    </span>
  );
  return (
    <div className={`kiosk-ticker ${serveiq ? "sq" : "sh"}`}>
      {items.length ? (
        <div className="kiosk-ticker-track">
          {run}
          {run}
        </div>
      ) : (
        <span className="kiosk-muted">
          Add ticker text in Widget Properties
        </span>
      )}
    </div>
  );
}

function Videos({ section }: { section: LayoutSection }) {
  const h =
    { compact: 300, standard: 400, large: 520 }[String(section.props.height)] ??
    400;
  return (
    <div className="kiosk-video" style={{ "--h": h } as React.CSSProperties}>
      <img src="/art/horizon.svg" alt="" />
      <span className="kiosk-video-play">
        <Play fill="currentColor" />
      </span>
      <small>{String(section.props.label || "Video playlist")}</small>
    </div>
  );
}

/* ───────────── SpaceHub (meetings) ───────────── */

type Room = {
  name: string;
  capacity: number;
  dept: string;
  organizer?: string;
  ends?: string;
  time?: string;
};
const ROOMS: Room[] = [
  {
    name: "Al Bustan Hall",
    capacity: 20,
    dept: "Finance",
    organizer: "Ahmed Al Harthy",
    ends: "24:15",
  },
  {
    name: "Majlis Room",
    capacity: 8,
    dept: "HR",
    organizer: "Fatma Al Balushi",
    ends: "41:02",
  },
  {
    name: "Innovation Lab",
    capacity: 10,
    dept: "IT",
    organizer: "Salim Al Riyami",
    ends: "12:48",
  },
  { name: "Training Room 1", capacity: 30, dept: "Training" },
  { name: "Board Room", capacity: 12, dept: "Executive" },
  { name: "Meeting Room 3", capacity: 6, dept: "Operations" },
  { name: "Meeting Room 4", capacity: 6, dept: "Legal" },
  { name: "Conference Hall", capacity: 60, dept: "Media" },
];
const UPCOMING: Room[] = [
  {
    name: "Board Room",
    capacity: 12,
    dept: "Executive",
    organizer: "Khalid Al Said",
    time: "11:00-12:00",
  },
  {
    name: "Training Room 1",
    capacity: 30,
    dept: "Training",
    organizer: "Maryam Al Lawati",
    time: "11:30-13:00",
  },
  {
    name: "Al Bustan Hall",
    capacity: 20,
    dept: "Finance",
    organizer: "Yousuf Al Kindi",
    time: "12:00-12:45",
  },
  {
    name: "Meeting Room 3",
    capacity: 6,
    dept: "Operations",
    organizer: "Aisha Al Habsi",
    time: "13:00-14:00",
  },
];
const GREEN = "#3bc25a",
  RED = "#f26061",
  BLUE = "#305CDE",
  AMBER = "#F39711";

function SectionBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="sh-badge sh-badge-wide"
      style={{ "--c": "rgba(255,255,255,.8)" } as React.CSSProperties}
    >
      <Glyph name={icon} size={30} color="rgba(255,255,255,.8)" />
      <span>{label}</span>
    </div>
  );
}

function RoomStatus() {
  const busy = ROOMS.filter((r) => r.organizer).length;
  return (
    <div className="sh-stats">
      {[
        [ROOMS.length - busy, "Free", GREEN],
        [busy, "Busy", RED],
        [UPCOMING.length, "Upcoming", BLUE],
      ].map(([n, label, c]) => (
        <div
          key={label}
          className="sh-badge"
          style={{ "--c": c } as React.CSSProperties}
        >
          <Glyph name="coworking" size={30} color={String(c)} />
          <b>{n}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function RoomCard({
  room,
  upcoming,
  showDept,
}: {
  room: Room;
  upcoming?: boolean;
  showDept: boolean;
}) {
  const booked = !!room.organizer;
  const accent = booked ? (upcoming ? BLUE : RED) : GREEN;
  const dept = showDept && booked;
  return (
    <div
      className={`sh-room ${upcoming ? "is-upcoming" : ""}`}
      style={{ "--c": accent } as React.CSSProperties}
    >
      <strong className="sh-room-name">{room.name}</strong>
      <div className="sh-room-cap">
        {dept ? <Glyph name="department" size={20} color="#fff" /> : <Users />}
        {!dept && <span>Capacity</span>}
        <b>{dept ? room.dept : room.capacity}</b>
      </div>
      <span className="sh-spacer" />
      {booked ? (
        <>
          <span className="sh-organizer">{room.organizer}</span>
          <span className="sh-pill">
            {upcoming ? (
              <>
                <Clock3 />
                <b>{room.time}</b>
              </>
            ) : (
              <>
                <Timer />
                <small>Ends in</small>
                <b>{room.ends}</b>
              </>
            )}
          </span>
        </>
      ) : (
        <span className="sh-available">
          <CheckCircle2 /> Available
        </span>
      )}
    </div>
  );
}

/* Counters on SpaceHub, as TokenCounters */
type Counter = {
  name: string;
  status: "serving" | "idle" | "closed" | "onbreak";
  token?: string;
  service?: string;
};
const SH_COUNTERS: Counter[] = [
  { name: "1", status: "serving", token: "A105", service: "Pension Services" },
  { name: "2", status: "serving", token: "B023", service: "Member Affairs" },
  { name: "3", status: "onbreak" },
  { name: "4", status: "closed" },
  { name: "5", status: "serving", token: "C311", service: "Loans" },
  { name: "6", status: "idle" },
];
const STATUS = {
  serving: [GREEN, "Serving"],
  idle: [BLUE, "Idle"],
  closed: [RED, "Closed"],
  onbreak: [AMBER, "On Break"],
} as const;

function ShCounters({
  section,
  compact,
}: {
  section: LayoutSection;
  compact: boolean;
}) {
  const list = compact ? SH_COUNTERS.slice(0, 3) : SH_COUNTERS;
  return (
    <div className="sh-counters-wrap">
      <SectionBadge
        icon="counter"
        label={String(section.props.title || "Counters")}
      />
      <div className="sh-counters">
        {list.map((c) => {
          const [color, label] = STATUS[c.status];
          const prefix = c.token?.match(/^[A-Z]+/)?.[0] ?? "";
          return (
            <div
              key={c.name}
              className="sh-counter"
              style={{ "--c": color } as React.CSSProperties}
            >
              {c.status === "serving" ? (
                <>
                  <div className="sh-counter-top">
                    <span>Counter {c.name}</span>
                    <small>{c.service}</small>
                  </div>
                  <div className="sh-counter-token">
                    <b>
                      <em>{prefix}</em>
                      {c.token?.slice(prefix.length)}
                    </b>
                    <span>{label}</span>
                    <i />
                  </div>
                </>
              ) : (
                <div className="sh-counter-idle">
                  <span>Counter {c.name}</span>
                  <b>{label}</b>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── ServeIQ (queue) ───────────── */

type Tile = {
  counter: string;
  status: "SERVING" | "CALLING" | "IDLE" | "CLOSED";
  token?: string;
};
const TILES: Tile[] = [
  { counter: "Counter 01", status: "SERVING", token: "A102" },
  { counter: "Counter 02", status: "SERVING", token: "B017" },
  { counter: "Counter 03", status: "CALLING", token: "A105" },
  { counter: "Counter 04", status: "IDLE" },
  { counter: "Counter 05", status: "SERVING", token: "C044" },
  { counter: "Counter 06", status: "CLOSED" },
];

function NowCalling({ section }: { section: LayoutSection }) {
  const secs = Number(section.props.walkSeconds) || 30;
  return (
    <div
      className="sq-calling"
      style={{ "--walk": `${secs}s` } as React.CSSProperties}
    >
      <div className="sq-calling-title">
        <span>{String(section.props.title || "NOW CALLING")}</span>
        <i />
        <span dir="rtl" className="ar">
          {String(section.props.titleAr || "النداء الحالي")}
        </span>
        <em>+2 waiting</em>
      </div>
      <div className="sq-calling-row">
        <div>
          <b className="sq-token">A105</b>
          <small>Please proceed to counter 03</small>
        </div>
        <ArrowRight className="sq-arrow" />
        <div className="sq-counter-no">
          <small>COUNTER</small>
          <b>03</b>
        </div>
      </div>
      <div className="sq-progress">
        <span>
          <i />
        </span>
        <small>{secs}s</small>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sq-panel">
      <strong>{title.toUpperCase()}</strong>
      <hr />
      <div className="sq-panel-body">{children}</div>
    </div>
  );
}

function SqCounters({ section }: { section: LayoutSection }) {
  return (
    <Panel title={String(section.props.title || "Current Counters")}>
      <div className="sq-tiles">
        {TILES.map((t) => {
          const [big, label, dot] =
            t.status === "SERVING"
              ? [t.token, "Serving", "#3CC46B"]
              : t.status === "CALLING"
                ? [t.token, "Called", "#F0B43C"]
                : t.status === "CLOSED"
                  ? ["Closed", "Closed", "#8C8796"]
                  : ["Idle", "Available", "#F0B43C"];
          return (
            <div
              key={t.counter}
              className={`sq-tile ${t.status === "CALLING" ? "is-calling" : ""} ${t.status === "CLOSED" ? "is-closed" : ""}`}
            >
              <div className="sq-tile-head">
                <span>{t.counter}</span>
                <i />
              </div>
              <b>{big}</b>
              <div className="sq-tile-state">
                <i style={{ background: dot }} />
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SqUpcoming({ section }: { section: LayoutSection }) {
  const title = String(section.props.title || "Upcoming");
  return (
    <Panel title={title}>
      <div className="sq-upcoming-head">{title}</div>
      <div className="sq-upcoming">
        {["A106", "A107", "B018"].map((t) => (
          <div key={t} className="sq-token-box">
            {t}
          </div>
        ))}
      </div>
      {section.props.showHold !== false && (
        <>
          <small className="sq-hold-label">Hold</small>
          <div className="sq-hold">
            {["A099", "B011"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </>
      )}
      <hr />
      <small className="sq-wait">Please wait for your call</small>
    </Panel>
  );
}

/* ───────────── one section ───────────── */

export function KioskWidget({
  section,
  page,
  sections,
}: {
  section: LayoutSection;
  page: KioskPage;
  sections: LayoutSection[];
}) {
  const serveiq = page !== SPACEHUB_PAGE;
  const showDept = !!section.props.showDepartment;
  switch (section.type) {
    case "sh_header":
    case "sq_header":
      return <Header section={section} serveiq={serveiq} />;
    case "sh_ticker":
    case "sq_ticker":
      return <Ticker section={section} serveiq={serveiq} />;
    case "sh_videos":
    case "sq_videos":
      return <Videos section={section} />;
    case "sh_room_status":
      return <RoomStatus />;
    case "sh_rooms":
      return (
        <div className="sh-block">
          <SectionBadge
            icon="room"
            label={String(section.props.title || "Rooms")}
          />
          <div className="sh-grid">
            {ROOMS.map((r) => (
              <RoomCard key={r.name} room={r} showDept={showDept} />
            ))}
          </div>
        </div>
      );
    case "sh_upcoming":
      return (
        <div className="sh-block">
          <SectionBadge
            icon="upcoming"
            label={String(section.props.title || "Upcoming")}
          />
          <div className="sh-grid is-upcoming">
            {UPCOMING.map((r) => (
              <RoomCard
                key={r.name + r.time}
                room={r}
                upcoming
                showDept={showDept}
              />
            ))}
          </div>
        </div>
      );
    case "sh_counters":
      // The TV shows 3 counters per page while upcoming meetings are on.
      return (
        <ShCounters
          section={section}
          compact={sections.some((s) => s.type === "sh_upcoming" && s.enabled)}
        />
      );
    case "sq_now_calling":
      return <NowCalling section={section} />;
    case "sq_counters":
      return <SqCounters section={section} />;
    case "sq_upcoming":
      return <SqUpcoming section={section} />;
    default:
      return null;
  }
}
