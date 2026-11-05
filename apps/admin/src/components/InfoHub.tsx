import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Accessibility,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  DoorOpen,
  Headphones,
  LayoutGrid,
  ListChecks,
  MapPin,
  Megaphone,
  Newspaper,
  Phone,
  RefreshCw,
  Users,
} from "lucide-react";
import type { LayoutSection } from "../types";
import { HUB_DATA, HUB_TABS, HubTabId } from "../infoHubData";
import "./InfoHub.scss";

export type HubRange = "today" | "week";
type Icon = React.ComponentType<{ size?: number }>;

const TAB_ICON: Record<HubTabId, Icon> = {
  live: LayoutGrid,
  news: Newspaper,
  services: MapPin,
  work: Briefcase,
};
const GUIDE_ICON: Record<string, Icon> = {
  building: Building2,
  door: DoorOpen,
  calendar: CalendarDays,
  access: Accessibility,
  help: Headphones,
};
const str = (v: unknown, f = "") => (typeof v === "string" && v ? v : f);

export function HubHeader({
  tab,
  onTab,
  range,
  onRange,
  context,
}: {
  tab: HubTabId;
  onTab: (t: HubTabId) => void;
  range: HubRange;
  onRange: (r: HubRange) => void;
  context: string;
}) {
  return (
    <div className="hub-top">
      <div className="hub-head">
        <div>
          <h3>Info Hub</h3>
          <p>Information, services & daily activity</p>
        </div>
        {tab === "work" ? (
          <div className="hub-range">
            {(["today", "week"] as HubRange[]).map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? "is-active" : ""}
                onClick={() => onRange(r)}
              >
                {r === "today" ? "Today" : "This week"}
              </button>
            ))}
          </div>
        ) : (
          <span className="hub-context">{context}</span>
        )}
      </div>
      <div className="hub-tabs">
        {HUB_TABS.map((t) => {
          const I = TAB_ICON[t.id];
          return (
            <button
              key={t.id}
              type="button"
              className={`hub-tab ${tab === t.id ? "is-active" : ""}`}
              onClick={() => onTab(t.id)}
            >
              <I size={11} /> {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HubFooter() {
  return (
    <div className="hub-foot">
      <span>
        <RefreshCw size={9} /> Updated 08:42 · Asia/Muscat
      </span>
      <span>Employee names visible</span>
    </div>
  );
}

function Shell({
  icon: I,
  title,
  subtitle,
  badge,
  footer,
  children,
}: {
  icon: Icon;
  title: string;
  subtitle?: string;
  badge?: string;
  footer?: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="hub-card">
      <header className="hub-card-head">
        <div className="hub-card-title">
          <I size={12} />
          <h4>{title}</h4>
        </div>
        {badge && <span className="hub-badge">{badge}</span>}
      </header>
      {subtitle && <p className="hub-card-sub">{subtitle}</p>}
      <div className="hub-card-body">{children}</div>
      {footer && (
        <footer className="hub-card-foot">
          <span>{footer[0]}</span>
          <span>{footer[1]}</span>
        </footer>
      )}
    </section>
  );
}

const Stats = ({ items }: { items: { v: React.ReactNode; l: string }[] }) => (
  <div className="hub-stats">
    {items.map((i) => (
      <div key={i.l}>
        <b>{i.v}</b>
        <small>{i.l}</small>
      </div>
    ))}
  </div>
);

const Pill = ({ status }: { status: string }) =>
  status === "occupied" ? (
    <span className="hub-pill is-amber">
      <Clock3 size={9} /> Occupied
    </span>
  ) : (
    <span className="hub-pill is-green">
      <Check size={9} /> Available
    </span>
  );

export function HubWidget({
  section,
  range,
}: {
  section: LayoutSection;
  range: HubRange;
}) {
  const p = section.props as Record<string, unknown>;
  const title = str(
    p.title,
    section.type.replace("hub_", "").replaceAll("_", " "),
  );
  const rawSub = str(p.subtitle);
  const subtitle =
    range === "week" ? rawSub.replace(/today/i, "this week") : rawSub;
  const badge = str(p.badge);
  const d = HUB_DATA[section.type];
  if (!d) return null;

  switch (section.type) {
    case "hub_meeting_rooms":
      return (
        <Shell icon={DoorOpen} title={title} subtitle={subtitle} badge={badge}>
          <Stats
            items={[
              { v: d.meetingsToday, l: "Meetings today" },
              { v: d.inProgress, l: "In progress" },
              { v: d.available, l: "Rooms available" },
            ]}
          />
          <ul className="hub-rows">
            {d.rooms.map((r: any) => (
              <li key={r.name} className="hub-row">
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.detail}</small>
                </div>
                <Pill status={r.status} />
              </li>
            ))}
          </ul>
        </Shell>
      );

    case "hub_queue_management":
      return (
        <Shell icon={Users} title={title} subtitle={subtitle} badge={badge}>
          <Stats
            items={[
              { v: d.served, l: "Served today" },
              { v: d.waiting, l: "Waiting" },
              { v: d.counters, l: "Active counters" },
            ]}
          />
          <div className="hub-eyebrow">NOW CALLING</div>
          <ul className="hub-calls">
            {d.calling.map((c: any) => (
              <li key={c.ticket}>
                <b>{c.ticket}</b>
                <ArrowRight size={11} />
                <span>{c.counter}</span>
              </li>
            ))}
          </ul>
        </Shell>
      );

    case "hub_priority_alerts":
      return (
        <div className="hub-alert">
          <AlertTriangle size={12} />
          <strong>{title}</strong>
          <span>{d.message}</span>
        </div>
      );

    case "hub_official_notices":
      return (
        <Shell
          icon={Megaphone}
          title={title}
          subtitle={subtitle}
          badge={badge}
          footer={d.footer}
        >
          {d.items.map((n: any) => (
            <article key={n.ref} className="hub-notice">
              <div className="hub-eyebrow">
                {n.dept} · {n.date}
              </div>
              <h5>{n.title}</h5>
              <p>{n.body}</p>
              <small>{n.ref}</small>
            </article>
          ))}
        </Shell>
      );

    case "hub_events_training":
      return (
        <Shell
          icon={CalendarDays}
          title={title}
          subtitle={subtitle}
          badge={badge}
          footer={d.footer}
        >
          {d.items.map((e: any) => (
            <article key={e.title} className="hub-event">
              <div className="hub-date">
                <b>{e.day}</b>
                <small>{e.month}</small>
              </div>
              <div>
                <h5>{e.title}</h5>
                <p>{e.meta}</p>
                <small>{e.audience}</small>
              </div>
            </article>
          ))}
        </Shell>
      );

    case "hub_media_highlights":
      return (
        <Shell
          icon={Newspaper}
          title={title}
          subtitle={subtitle}
          badge={badge}
          footer={d.footer}
        >
          <div className="hub-media">
            <Users size={20} />
            <span>{d.tag}</span>
          </div>
          <h5 className="hub-media-title">{d.title}</h5>
          <p className="hub-media-body">{d.body}</p>
          <small className="hub-muted">{d.meta}</small>
          <div className="hub-next">
            <strong>{d.next.title}</strong>
            <small>{d.next.meta}</small>
          </div>
        </Shell>
      );

    case "hub_services_information":
      return (
        <Shell icon={Building2} title={title} subtitle={subtitle} badge={badge}>
          {d.items.map((s: any) => (
            <article key={s.title} className="hub-service">
              <h5>{s.title}</h5>
              <p>{s.body}</p>
              <span>
                <MapPin size={9} /> {s.location}
              </span>
              <span>
                <Phone size={9} /> {s.extension}
              </span>
              <em>{s.hours}</em>
            </article>
          ))}
        </Shell>
      );

    case "hub_visitor_guide":
      return (
        <Shell icon={MapPin} title={title} subtitle={subtitle} badge={badge}>
          <ul className="hub-rows">
            {d.items.map((g: any) => {
              const I = GUIDE_ICON[g.icon] || Building2;
              return (
                <li key={g.title} className="hub-row">
                  <span className="hub-guide-icon">
                    <I size={12} />
                  </span>
                  <div>
                    <strong>{g.title}</strong>
                    <small>{g.detail}</small>
                  </div>
                  {g.badge && <span className="hub-level">{g.badge}</span>}
                </li>
              );
            })}
          </ul>
        </Shell>
      );

    case "hub_helpdesk_summary": {
      const h = d[range];
      return (
        <Shell
          icon={Headphones}
          title={title}
          subtitle={subtitle}
          badge={badge}
          footer={d.footer}
        >
          <div className="hub-help">
            <div className="hub-help-total">
              <b>{h.total}</b>
              <small>Total tickets</small>
            </div>
            <div className="hub-help-tiles">
              <div className="is-green">
                <b>{h.resolved}</b>
                <small>
                  <Check size={9} /> Resolved
                </small>
              </div>
              <div className="is-amber">
                <b>{h.pending}</b>
                <small>
                  <Clock3 size={9} /> Pending
                </small>
              </div>
            </div>
          </div>
          <div className="hub-progress">
            <i style={{ width: `${h.progress}%` }} />
          </div>
          <div className="hub-progress-label">
            <span>Resolution progress</span>
            <span>{h.progress}%</span>
          </div>
        </Shell>
      );
    }

    case "hub_task_summary": {
      const t = d[range];
      return (
        <Shell
          icon={ListChecks}
          title={title}
          subtitle={subtitle}
          badge={badge}
          footer={t.footer}
        >
          <Stats
            items={[
              { v: t.total, l: "Total tasks" },
              { v: t.finished, l: "Finished" },
              { v: t.pending, l: "Pending" },
            ]}
          />
          <div className="hub-list-head">
            <strong>Pending tasks</strong>
            <small>Earliest deadline first</small>
          </div>
          <ul className="hub-rows">
            {d.tasks.map((k: any) => (
              <li
                key={k.title}
                className={`hub-row hub-task ${k.priority === "High" ? "is-high" : ""}`}
              >
                <div>
                  <strong>{k.title}</strong>
                  <small>
                    {k.owner} · {k.priority}
                  </small>
                </div>
                <span className="hub-due">{k.due}</span>
              </li>
            ))}
          </ul>
        </Shell>
      );
    }

    default:
      return null;
  }
}
