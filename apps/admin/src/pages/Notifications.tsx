import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Flame, Save, Send, XCircle } from "lucide-react";
import { API, request } from "../api";
import type { Role } from "../types";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  FormField,
  Loading,
  PageHeading,
  Status,
  useFeedback,
} from "../components/Common";
import { PROFILE_TYPES } from "../profileTypes";

export const notificationCategories = [
  {
    id: "EMERGENCY",
    label: "Emergency",
    color: "#c0392b",
    hint: "Evacuation, fire, safety",
  },
  {
    id: "WARNING",
    label: "Warning",
    color: "#d68910",
    hint: "Weather, disruption, outage",
  },
  { id: "INFO", label: "Info", color: "#2e86c1", hint: "General information" },
  {
    id: "ANNOUNCEMENT",
    label: "Announcement",
    color: "#8e6b3e",
    hint: "Company news, reminders",
  },
  {
    id: "CELEBRATION",
    label: "Celebration",
    color: "#7d3c98",
    hint: "Holidays, achievements",
  },
] as const;
type Category = (typeof notificationCategories)[number]["id"];
type Sent = {
  id: string;
  title: string;
  message: string;
  category: Category;
  durationSeconds: number;
  playSound: boolean;
  screenIds: string[];
  status: "sent" | "expired" | "cancelled";
  alertId: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
};
const empty = {
  title: "",
  message: "",
  category: "INFO" as Category,
  durationSeconds: 30,
  playSound: true,
  allScreens: true,
  screenIds: [] as string[],
  addToPriorityAlerts: false,
  alertEndAt: "",
};
const when = (v: string) => new Date(v).toLocaleString();

export const fireAlarmColor = "#e0201b";
const tvProfiles = PROFILE_TYPES;
type FireAlarm = {
  enabled: boolean;
  profiles: string[];
  gatewayIp: string;
  tcpPort: number;
  unitId: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const fireAlarmKey = "madar.fireAlarm";
function readFireAlarm(): FireAlarm | null {
  try {
    const v = JSON.parse(localStorage.getItem(fireAlarmKey) || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Emergency Alerts → Fire Alarm: the Modbus TCP gateway of the fire alarm
 * panel and the TV profiles it applies to (none ticked = all). UI only:
 * saving keeps it in this browser and shows "Fire alarm enabled". */
function FireAlarmConfig({
  canEdit,
  feedback,
  onChange,
}: {
  canEdit: boolean;
  feedback: ReturnType<typeof useFeedback>;
  onChange: (v: FireAlarm | null) => void;
}) {
  // UI only for now: the configuration is kept in this browser.
  const [data, setData] = useState<FireAlarm | null>(readFireAlarm);
  const [form, setForm] = useState({
    all: !data?.profiles.length,
    profiles: data?.profiles ?? ([] as string[]),
    gatewayIp: data?.gatewayIp ?? "",
    tcpPort: data?.tcpPort ?? 502,
    unitId: data?.unitId ?? 1,
  });
  function store(next: FireAlarm | null) {
    try {
      if (next) localStorage.setItem(fireAlarmKey, JSON.stringify(next));
      else localStorage.removeItem(fireAlarmKey);
    } catch {
      /* storage blocked: keep it for this visit only */
    }
    setData(next);
    onChange(next);
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.all && !form.profiles.length) {
      feedback.error("Choose at least one TV profile, or tick All profiles.");
      return;
    }
    store({
      enabled: true,
      profiles: form.all ? [] : form.profiles,
      gatewayIp: form.gatewayIp.trim(),
      tcpPort: Number(form.tcpPort),
      unitId: Number(form.unitId),
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    });
    feedback.success("Fire alarm enabled");
  }
  function disable() {
    if (data)
      store({ ...data, enabled: false, updatedAt: new Date().toISOString() });
    feedback.success("Fire alarm disabled");
  }
  return (
    <form
      className="normal-form fire-alarm-config"
      onSubmit={save}
      style={{ "--cat": fireAlarmColor } as React.CSSProperties}
    >
      <div className="fire-alarm-head">
        <Flame size={18} />
        <div>
          <strong>Configure fire alarm</strong>
          <span>
            Connect the fire alarm panel through its Modbus TCP gateway, and
            choose which TV profiles show the fire alarm.
          </span>
        </div>
        <span className={"fire-alarm-state" + (data?.enabled ? " is-on" : "")}>
          {data?.enabled ? "Fire alarm enabled" : "Not enabled"}
        </span>
      </div>
      {data?.enabled && (
        <div className="fire-alarm-summary">
          <strong>Fire alarm enabled</strong>
          <span>
            Gateway {data.gatewayIp}:{data.tcpPort} · Unit ID {data.unitId} ·{" "}
            {data.profiles.length
              ? data.profiles
                  .map((p) => tvProfiles.find(([id]) => id === p)?.[1] ?? p)
                  .join(", ")
              : "All profiles"}
          </span>
        </div>
      )}
      <div className="access-pages">
        <strong>TV profiles</strong>
        <label className="checkline">
          <input
            type="checkbox"
            checked={form.all}
            onChange={(e) =>
              setForm({ ...form, all: e.target.checked, profiles: [] })
            }
          />{" "}
          All profiles
        </label>
        <div className="page-allow-list">
          {tvProfiles.map(([id, label]) => (
            <label className="checkline" key={id}>
              <input
                type="checkbox"
                checked={form.all || form.profiles.includes(id)}
                onChange={(e) => {
                  const base = form.all
                    ? tvProfiles.map(([p]) => p as string)
                    : form.profiles;
                  const next = e.target.checked
                    ? [...base, id]
                    : base.filter((p) => p !== id);
                  setForm({
                    ...form,
                    all: next.length === tvProfiles.length,
                    profiles: next.length === tvProfiles.length ? [] : next,
                  });
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <FormField
        label="Gateway IP"
        help="The IP address of the Modbus TCP gateway, for example 192.168.1.50."
      >
        <input
          required
          inputMode="decimal"
          pattern="^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$"
          title="An IPv4 address such as 192.168.1.50"
          value={form.gatewayIp}
          onChange={(e) => setForm({ ...form, gatewayIp: e.target.value })}
          placeholder="192.168.1.50"
        />
      </FormField>
      <div className="form-grid">
        <FormField label="TCP port" help="Modbus TCP uses 502 by default.">
          <input
            required
            type="number"
            min={1}
            max={65535}
            value={form.tcpPort}
            onChange={(e) =>
              setForm({ ...form, tcpPort: Number(e.target.value) })
            }
          />
        </FormField>
        <FormField
          label="Unit ID"
          help="The Modbus slave ID of the panel (0 to 255)."
        >
          <input
            required
            type="number"
            min={0}
            max={255}
            value={form.unitId}
            onChange={(e) =>
              setForm({ ...form, unitId: Number(e.target.value) })
            }
          />
        </FormField>
      </div>
      {data?.updatedAt && (
        <span className="table-muted">
          Last saved {when(data.updatedAt)}
          {data.updatedBy ? ` by ${data.updatedBy}` : ""}
        </span>
      )}
      <div className="form-actions">
        {data?.enabled && (
          <Button variant="secondary" onClick={disable} disabled={!canEdit}>
            Disable
          </Button>
        )}
        <Button icon={Save} type="submit" disabled={!canEdit}>
          Save and enable
        </Button>
      </div>
      {!canEdit && (
        <span className="table-muted">
          Only administrators can change the fire alarm configuration.
        </span>
      )}
    </form>
  );
}

export default function Notifications({ role }: { role: Role }) {
  const client = useQueryClient(),
    feedback = useFeedback();
  const {
    data: history,
    error,
    isLoading,
  } = useQuery<Sent[]>({
    queryKey: ["notifications"],
    queryFn: () => request("/api/admin/notifications"),
    refetchInterval: 5000,
  });
  const { data: screens = [] } = useQuery({
    queryKey: ["screens"],
    queryFn: API.screens,
  });
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [fire, setFire] = useState(false);
  const [fireAlarm, setFireAlarm] = useState<FireAlarm | null>(readFireAlarm);
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const canSend = role === "admin";
  const screenName = useMemo(
    () => Object.fromEntries(screens.map((s) => [s.id, s.name])),
    [screens],
  );
  const category = notificationCategories.find((c) => c.id === form.category)!;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!form.allScreens && !form.screenIds.length) {
      feedback.error("Choose at least one screen, or send to all screens.");
      return;
    }
    setBusy(true);
    try {
      await request("/api/admin/notifications", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          category: form.category,
          durationSeconds: Number(form.durationSeconds),
          playSound: form.playSound,
          screenIds: form.allScreens ? [] : form.screenIds,
          addToPriorityAlerts: form.addToPriorityAlerts,
          ...(form.addToPriorityAlerts && form.alertEndAt
            ? { alertEndAt: new Date(form.alertEndAt).toISOString() }
            : {}),
        }),
      });
      feedback.success(
        form.allScreens
          ? "Notification sent to all screens"
          : `Notification sent to ${form.screenIds.length} screen(s)`,
      );
      setForm({ ...empty, category: form.category });
      await client.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      feedback.error(err);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(n: Sent) {
    if (!window.confirm(`Take "${n.title}" off the screens now?`)) return;
    try {
      await request(`/api/admin/notifications/${n.id}/cancel`, {
        method: "POST",
      });
      feedback.success("Notification cancelled");
      await client.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      feedback.error(err);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ALERTS / LIVE"
        title="Emergency Alerts"
        subtitle="Show a full-screen message on all TVs or chosen screens right now. It closes by itself after the duration, or when you cancel it."
      />
      <div className="info-strip">
        <BellRing size={18} />
        <span>
          For a notice that stays in the TV's Priority Alerts page, tick "Also
          add to Priority Alerts", or manage them under Content Management →
          Priority Alerts.
        </span>
      </div>
      <div className="settings-layout">
        <Card>
          <div className="card-head">
            <div>
              <h3>
                <Send size={16} /> New notification
              </h3>
              <p>Screens pick it up within a few seconds.</p>
            </div>
          </div>
          <div className="normal-form">
            <FormField label="Category">
              <div className="notification-categories">
                {notificationCategories.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={
                      "notification-category" +
                      (form.category === c.id ? " selected" : "")
                    }
                    style={{ "--cat": c.color } as React.CSSProperties}
                    onClick={() => {
                      set("category", c.id);
                      setFire(false);
                    }}
                    title={c.hint}
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={
                    "notification-category is-fire" + (fire ? " selected" : "")
                  }
                  style={{ "--cat": fireAlarmColor } as React.CSSProperties}
                  onClick={() => setFire(true)}
                  title="Connect the fire alarm panel (Modbus TCP gateway)"
                >
                  <Flame size={14} /> Fire Alarm
                  {fireAlarm?.enabled && (
                    <span className="fire-alarm-dot">Enabled</span>
                  )}
                </button>
              </div>
            </FormField>
          </div>
          {fire ? (
            <FireAlarmConfig
              canEdit={canSend}
              feedback={feedback}
              onChange={setFireAlarm}
            />
          ) : (
            <form className="normal-form" onSubmit={send}>
              <FormField label="Title">
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Fire drill at 11:00"
                />
              </FormField>
              <FormField label="Message (optional)">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Please leave by the nearest exit and gather at the car park."
                />
              </FormField>
              <FormField
                label={`Show for ${form.durationSeconds} seconds`}
                help="Between 5 and 120 seconds."
              >
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={form.durationSeconds}
                  onChange={(e) =>
                    set("durationSeconds", Number(e.target.value))
                  }
                />
              </FormField>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.playSound}
                  onChange={(e) => set("playSound", e.target.checked)}
                />{" "}
                Play a sound on the TV
              </label>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.allScreens}
                  onChange={(e) => set("allScreens", e.target.checked)}
                />{" "}
                Send to all screens
              </label>
              {!form.allScreens && (
                <div className="access-pages">
                  <strong>
                    Choose screens ({form.screenIds.length} selected)
                  </strong>
                  {screens.length ? (
                    <div className="page-allow-list">
                      {screens.map((s) => (
                        <label className="checkline" key={s.id}>
                          <input
                            type="checkbox"
                            checked={form.screenIds.includes(s.id)}
                            onChange={(e) =>
                              set(
                                "screenIds",
                                e.target.checked
                                  ? [...form.screenIds, s.id]
                                  : form.screenIds.filter((x) => x !== s.id),
                              )
                            }
                          />
                          {s.name}
                          {s.location ? ` · ${s.location}` : ""}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="table-muted">
                      No screens are paired yet.
                    </span>
                  )}
                </div>
              )}
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.addToPriorityAlerts}
                  onChange={(e) => set("addToPriorityAlerts", e.target.checked)}
                />{" "}
                Also add to Priority Alerts
              </label>
              {form.addToPriorityAlerts && (
                <FormField
                  label="Keep in Priority Alerts until"
                  help="Leave empty for 24 hours."
                >
                  <input
                    type="datetime-local"
                    value={form.alertEndAt}
                    onChange={(e) => set("alertEndAt", e.target.value)}
                  />
                </FormField>
              )}
              <div
                className="notification-preview"
                style={{ "--cat": category.color } as React.CSSProperties}
              >
                <small>{category.label.toUpperCase()}</small>
                <strong>{form.title || "Your title appears here"}</strong>
                {form.message && <span>{form.message}</span>}
              </div>
              <div className="form-actions">
                <Button
                  icon={Send}
                  type="submit"
                  loading={busy}
                  disabled={!canSend}
                >
                  Send now
                </Button>
              </div>
              {!canSend && (
                <span className="table-muted">
                  Only administrators can send notifications.
                </span>
              )}
            </form>
          )}
        </Card>
        <Card>
          <div className="card-head">
            <div>
              <h3>Notification history</h3>
              <p>Latest 200 notifications. Active ones can be cancelled.</p>
            </div>
          </div>
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorBox error={error} />
          ) : history?.length ? (
            <div className="responsive-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>NOTIFICATION</th>
                    <th>SCREENS</th>
                    <th>SENT</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <div className="content-name">
                          <span
                            className="profile-dot"
                            style={{
                              background: notificationCategories.find(
                                (c) => c.id === n.category,
                              )?.color,
                            }}
                          />
                          <div>
                            <strong>{n.title}</strong>
                            <small>
                              {n.category} · {n.durationSeconds}s
                              {n.playSound ? " · sound" : ""}
                              {n.alertId ? " · in Priority Alerts" : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {n.screenIds.length
                          ? n.screenIds
                              .map((id) => screenName[id] || "Removed screen")
                              .join(", ")
                          : "All screens"}
                      </td>
                      <td>
                        {when(n.createdAt)}
                        <br />
                        <small className="table-muted">{n.createdBy}</small>
                      </td>
                      <td>
                        <Status
                          value={
                            n.status === "sent"
                              ? "Active"
                              : n.status === "cancelled"
                                ? "Cancelled"
                                : "Expired"
                          }
                        />
                        {n.cancelledBy && (
                          <>
                            <br />
                            <small className="table-muted">
                              by {n.cancelledBy}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="action-cell">
                          {n.status === "sent" && (
                            <Button
                              variant="danger"
                              icon={XCircle}
                              onClick={() => cancel(n)}
                              disabled={!canSend}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No notifications yet"
              description="Notifications you send appear here."
            />
          )}
        </Card>
      </div>
      {feedback.node}
    </>
  );
}
