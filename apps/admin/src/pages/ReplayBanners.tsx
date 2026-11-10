import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Clock3,
  FileImage,
  History,
  ImagePlus,
  Monitor,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { API } from "../api";
import type { Resource, Role } from "../types";
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
import "./replay-banners.css";

/**
 * Banners → Replay: "featured programme" banners shown at the top of the TV
 * Replay page. Each one points at a Video Library video or a replay programme
 * (a channel show that already aired); its title,
 * category, description, duration and artwork come from that video and can
 * be overridden. Stored as Featured Banners with placement "replay".
 */

const PROFILE_TYPES = [
  { id: "public", label: "Public" },
  { id: "employee", label: "Employee" },
  { id: "management", label: "Management" },
  { id: "vip", label: "VIP" },
  { id: "signage", label: "Signage" },
];

type Draft = {
  targetId: string;
  bannerLabel: string;
  title: string;
  description: string;
  ctaText: string;
  image: string;
  landscapeImage: string;
  portraitImage: string;
  visibleTo: string[];
  screenGroups: string[];
  startAt: string;
  endAt: string;
  priority: number;
};

const blank = (): Draft => ({
  targetId: "",
  bannerLabel: "Featured Replay",
  title: "",
  description: "",
  ctaText: "Watch replay",
  image: "",
  landscapeImage: "",
  portraitImage: "",
  visibleTo: ["public"],
  screenGroups: [],
  ...period("week"),
  priority: 1,
});

// <input type="datetime-local"> works in local time without seconds.
const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fromIso = (v: unknown) =>
  typeof v === "string" && v ? toLocal(new Date(v)) : "";
const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);

function period(kind: "today" | "week" | "month") {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (kind === "today") end.setDate(end.getDate() + 1);
  if (kind === "week") end.setDate(end.getDate() + 7);
  if (kind === "month") end.setMonth(end.getMonth() + 1);
  end.setMinutes(end.getMinutes() - 1);
  return { startAt: toLocal(start), endAt: toLocal(end) };
}

const minutes = (p?: Resource) => {
  if (!p) return null;
  if (typeof p.durationSeconds === "number")
    return Math.round(p.durationSeconds / 60);
  const s = Date.parse(p.eventStart),
    e = Date.parse(p.eventEnd);
  return Number.isFinite(s) && Number.isFinite(e)
    ? Math.round((e - s) / 60000)
    : null;
};
const shortDate = (v?: string) =>
  v
    ? new Date(v).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : "…";

function liveState(b: Resource) {
  const now = Date.now();
  if (b.status !== "published") return null;
  if (b.startAt && Date.parse(b.startAt) > now) return "Scheduled";
  if (b.endAt && Date.parse(b.endAt) <= now) return "Ended";
  return "On TVs now";
}

export default function ReplayBanners({
  role,
  tabs,
}: {
  role: Role;
  tabs?: React.ReactNode;
}) {
  const client = useQueryClient(),
    feedback = useFeedback();
  const canEdit = role !== "viewer",
    canPublish = role === "admin";
  const banners = useQuery({
    queryKey: ["resources", "featured"],
    queryFn: () => API.resources("featured"),
  });
  const { data: videos = [] } = useQuery({
    queryKey: ["resources", "videos"],
    queryFn: () => API.resources("videos"),
  });
  const { data: shows = [] } = useQuery({
    queryKey: ["resources", "replay"],
    queryFn: () => API.resources("replay"),
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["resources", "channels"],
    queryFn: () => API.resources("channels"),
  });
  // Both kinds can be featured: videos and channel shows that already aired.
  const programmes = useMemo<Resource[]>(
    () => [
      ...shows.map((p) => ({ ...p, _kind: "replay" })),
      ...videos.map((p) => ({ ...p, _kind: "videos" })),
    ],
    [shows, videos],
  );
  const channelName = (p?: Resource) =>
    p?._kind === "replay"
      ? channels.find((c) => c.id === p.channelId)?.title || "Channel show"
      : "";
  const aired = (p?: Resource) =>
    p?._kind === "replay" && p.eventStart
      ? new Date(p.eventStart).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const describe = (p?: Resource) =>
    [
      channelName(p),
      p?.category || (p?._kind === "replay" ? "" : "Video"),
      minutes(p) ? `${minutes(p)} min` : "",
      aired(p) ? `aired ${aired(p)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: API.profiles,
  });
  const { data: screens = [] } = useQuery({
    queryKey: ["screens"],
    queryFn: API.screens,
  });
  const [editing, setEditing] = useState<Resource | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const list = (banners.data || [])
    .filter((b) => b.placement === "replay")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const programme = programmes.find((p) => p.id === draft.targetId);
  const groups = useMemo(
    () =>
      [
        ...new Set(
          screens.map((s) => s.groupName).filter((g): g is string => !!g),
        ),
      ].sort(),
    [screens],
  );
  const matches = programmes
    .filter((p) =>
      `${p.title} ${p.category || ""} ${p.description || ""} ${channelName(p)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice(0, 8);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function startNew() {
    setDraft(blank());
    setEditing(null);
    setQuery("");
    setOpen(true);
  }
  function startEdit(b: Resource) {
    setDraft({
      targetId: b.targetId || "",
      bannerLabel: b.bannerLabel || "Featured Replay",
      title: b.title || "",
      description: b.description || "",
      ctaText: b.ctaText || "Watch replay",
      image: b.image || "",
      landscapeImage: b.landscapeImage || "",
      portraitImage: b.portraitImage || "",
      visibleTo: b.visibleTo || [],
      screenGroups: b.screenGroups || [],
      startAt: fromIso(b.startAt),
      endAt: fromIso(b.endAt),
      priority: (b.sortOrder ?? 0) + 1,
    });
    setEditing(b);
    setQuery("");
    setOpen(true);
  }
  function choose(p: Resource) {
    // Title, description and artwork follow the video; the admin can
    // still edit the promotional text afterwards.
    setDraft((d) => ({
      ...d,
      targetId: p.id,
      title: p.title || "",
      description: p.description || "",
      image: p.image || "",
    }));
    setQuery("");
  }
  async function upload(file: File, field: "landscapeImage" | "portraitImage") {
    setUploading(field);
    try {
      const r = await API.uploadAsset(file);
      set(field, r.url);
    } catch (e) {
      feedback.error(e);
    } finally {
      setUploading(null);
    }
  }
  async function save(status: "draft" | "review" | "published") {
    if (!programme) return feedback.error("Choose the video first.");
    if (!draft.visibleTo.length)
      return feedback.error("Choose at least one profile to show it on.");
    if (draft.startAt && draft.endAt && draft.endAt <= draft.startAt)
      return feedback.error("The end date must be after the start date.");
    setBusy(true);
    const payload: Record<string, unknown> = {
      placement: "replay",
      targetType: programme._kind === "replay" ? "replay" : "video",
      targetId: draft.targetId,
      bannerLabel: draft.bannerLabel.trim() || "Featured Replay",
      title: draft.title.trim() || programme.title,
      description: draft.description,
      ctaText: draft.ctaText.trim() || "Watch replay",
      category: programme.category || "",
      status,
      sortOrder: Math.max(0, Number(draft.priority) - 1),
      visibleTo: draft.visibleTo,
      screenGroups: draft.screenGroups,
      bannerMode: "override",
      bannerTitle: draft.title.trim() || programme.title,
      bannerDescription: draft.description,
    };
    for (const k of ["image", "landscapeImage", "portraitImage"] as const)
      if (draft[k]) payload[k] = draft[k];
    const start = toIso(draft.startAt),
      end = toIso(draft.endAt);
    if (start) payload.startAt = start;
    if (end) payload.endAt = end;
    try {
      if (editing)
        await API.updateResource("featured", editing.id, {
          ...payload,
          revision: editing.revision,
        });
      else await API.addResource("featured", payload);
      feedback.success(
        status === "published"
          ? "Featured replay published to TVs"
          : status === "review"
            ? "Sent for approval"
            : "Draft saved",
      );
      await client.invalidateQueries({ queryKey: ["resources", "featured"] });
      setOpen(false);
    } catch (e) {
      feedback.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove(b: Resource) {
    if (!window.confirm(`Delete the banner "${b.title}"?`)) return;
    try {
      await API.deleteResource("featured", b.id);
      feedback.success("Banner deleted");
      await client.invalidateQueries({ queryKey: ["resources", "featured"] });
    } catch (e) {
      feedback.error(e);
    }
  }

  if (open) {
    const mins = minutes(programme);
    const wide = draft.landscapeImage || draft.image;
    const tall = draft.portraitImage || draft.landscapeImage || draft.image;
    const profileNames = (type: string) =>
      profiles
        .filter((p) => p.profileType === type)
        .map((p) => p.name)
        .join(", ");
    return (
      <>
        <PageHeading
          eyebrow="BANNERS / REPLAY"
          title={editing ? "Edit featured programme" : "Add featured programme"}
          subtitle="Feature a video or a channel show at the top of the TV Replay page."
        >
          <Button
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => setOpen(false)}
          >
            Back to banners
          </Button>
        </PageHeading>
        <div className="rb-layout">
          <div className="rb-form">
            <Card>
              <div className="rb-step">
                <span>1</span>
                <div>
                  <h3>Video</h3>
                  <p>Search your videos and channel shows and pick one.</p>
                </div>
              </div>
              {programme ? (
                <div className="rb-picked">
                  <div className="rb-thumb">
                    {programme.image ? (
                      <img src={programme.image} alt="" />
                    ) : (
                      <FileImage size={20} />
                    )}
                  </div>
                  <div className="rb-picked-text">
                    <strong>{programme.title}</strong>
                    <small>
                      {describe(programme)}
                    </small>
                    {programme.status !== "published" && (
                      <small className="rb-warn">
                        This is not published yet. Publish it in
                        {programme._kind === "replay"
                          ? " Replay Programmes"
                          : " Video Library"}{" "}
                        before publishing the banner.
                      </small>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!canEdit}
                    onClick={() => set("targetId", "")}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="searchbox rb-search">
                    <Search size={17} />
                    <input
                      autoFocus
                      placeholder="Search by title, channel or category…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="rb-results">
                    {matches.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="rb-result"
                        disabled={!canEdit}
                        onClick={() => choose(p)}
                      >
                        <div className="rb-thumb">
                          {p.image ? (
                            <img src={p.image} alt="" />
                          ) : (
                            <History size={18} />
                          )}
                        </div>
                        <span>
                          <strong>{p.title}</strong>
                          <small>
                            {describe(p)}
                          </small>
                        </span>
                        <Status value={p.status} />
                      </button>
                    ))}
                    {!matches.length && (
                      <Empty
                        title="Nothing found"
                        description="Add videos in Video Library, or channel shows in Replay Programmes."
                      />
                    )}
                  </div>
                </>
              )}
            </Card>

            <Card>
              <div className="rb-step">
                <span>2</span>
                <div>
                  <h3>Banner details</h3>
                  <p>Filled from the video. Edit the promotional text if you like.</p>
                </div>
              </div>
              <div className="form-grid">
                <FormField label="Label">
                  <input
                    maxLength={40}
                    value={draft.bannerLabel}
                    disabled={!canEdit}
                    onChange={(e) => set("bannerLabel", e.target.value)}
                  />
                </FormField>
                <FormField label="Button">
                  <input
                    maxLength={30}
                    value={draft.ctaText}
                    disabled={!canEdit}
                    onChange={(e) => set("ctaText", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label="Title">
                <input
                  maxLength={180}
                  value={draft.title}
                  disabled={!canEdit}
                  placeholder={programme?.title || "Video title"}
                  onChange={(e) => set("title", e.target.value)}
                />
              </FormField>
              <FormField label="Short promotional text">
                <textarea
                  rows={3}
                  maxLength={300}
                  value={draft.description}
                  disabled={!canEdit}
                  onChange={(e) => set("description", e.target.value)}
                />
              </FormField>
              <div className="rb-meta">
                <span>
                  <Monitor size={14} />{" "}
                  {programme?._kind === "replay" ? "Channel" : "Category"}:{" "}
                  <b>
                    {(programme?._kind === "replay"
                      ? channelName(programme)
                      : programme?.category) || "—"}
                  </b>
                </span>
                <span>
                  <Clock3 size={14} /> Duration:{" "}
                  <b>{mins ? `${mins} min` : "—"}</b>
                </span>
              </div>
            </Card>

            <Card>
              <div className="rb-step">
                <span>3</span>
                <div>
                  <h3>Banner artwork (optional)</h3>
                  <p>Without uploads the video's own artwork is used.</p>
                </div>
              </div>
              {(["landscapeImage", "portraitImage"] as const).map((field) => (
                <div className="banner-upload-row" key={field}>
                  <label>
                    <ImagePlus size={14} />{" "}
                    {field === "landscapeImage"
                      ? "Landscape artwork (16:9)"
                      : "Portrait artwork (9:16)"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={!canEdit || uploading !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f, field);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {uploading === field && (
                    <small className="block-muted" role="status">
                      Uploading and verifying image…
                    </small>
                  )}
                  {!!draft[field] && (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => set(field, "")}
                    >
                      Use the video's artwork instead
                    </button>
                  )}
                </div>
              ))}
            </Card>

            <Card>
              <div className="rb-step">
                <span>4</span>
                <div>
                  <h3>Who sees it</h3>
                  <p>Pick the display profiles, and optionally screen groups.</p>
                </div>
              </div>
              <div className="rb-chips" role="group" aria-label="Profiles">
                {PROFILE_TYPES.map((t) => {
                  const on = draft.visibleTo.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      className={`rb-chip ${on ? "on" : ""}`}
                      disabled={!canEdit}
                      title={profileNames(t.id)}
                      onClick={() =>
                        set(
                          "visibleTo",
                          on
                            ? draft.visibleTo.filter((v) => v !== t.id)
                            : [...draft.visibleTo, t.id],
                        )
                      }
                    >
                      {on && <Check size={14} />} {t.label}
                    </button>
                  );
                })}
              </div>
              {groups.length > 0 && (
                <>
                  <p className="rb-sub">
                    <Users size={14} /> Screen groups{" "}
                    <small>(none selected = every screen on those profiles)</small>
                  </p>
                  <div className="rb-chips">
                    {groups.map((g) => {
                      const on = draft.screenGroups.includes(g);
                      return (
                        <button
                          type="button"
                          key={g}
                          className={`rb-chip ${on ? "on" : ""}`}
                          disabled={!canEdit}
                          onClick={() =>
                            set(
                              "screenGroups",
                              on
                                ? draft.screenGroups.filter((v) => v !== g)
                                : [...draft.screenGroups, g],
                            )
                          }
                        >
                          {on && <Check size={14} />} {g}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>

            <Card>
              <div className="rb-step">
                <span>5</span>
                <div>
                  <h3>When and priority</h3>
                  <p>Priority 1 shows first when several banners are live.</p>
                </div>
              </div>
              <div className="rb-chips">
                {(
                  [
                    ["today", "Today"],
                    ["week", "This week"],
                    ["month", "This month"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    type="button"
                    key={k}
                    className="rb-chip"
                    disabled={!canEdit}
                    onClick={() => setDraft((d) => ({ ...d, ...period(k) }))}
                  >
                    <CalendarRange size={14} /> {label}
                  </button>
                ))}
              </div>
              <div className="form-grid rb-dates">
                <FormField label="Show from">
                  <input
                    type="datetime-local"
                    value={draft.startAt}
                    disabled={!canEdit}
                    onChange={(e) => set("startAt", e.target.value)}
                  />
                </FormField>
                <FormField label="Show until">
                  <input
                    type="datetime-local"
                    value={draft.endAt}
                    disabled={!canEdit}
                    onChange={(e) => set("endAt", e.target.value)}
                  />
                </FormField>
                <FormField label="Priority">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={draft.priority}
                    disabled={!canEdit}
                    onChange={(e) => set("priority", Number(e.target.value) || 1)}
                  />
                </FormField>
              </div>
            </Card>
          </div>

          <aside className="rb-preview-col">
            <Card>
              <div className="rb-step">
                <span>6</span>
                <div>
                  <h3>Preview and publish</h3>
                  <p>How the banner opens the TV Replay page.</p>
                </div>
              </div>
              <div className="rb-tv">
                <div className="rb-tv-art">
                  {wide ? <img src={wide} alt="" /> : <FileImage size={34} />}
                </div>
                <div className="rb-tv-copy">
                  <div className="rb-tv-eyebrow">
                    <span>
                      {(draft.bannerLabel || "Featured Replay").toUpperCase()}
                      {channelName(programme) || programme?.category
                        ? ` · ${(channelName(programme) || programme?.category || "").toUpperCase()}`
                        : ""}
                      {mins ? ` · ${mins} MIN` : ""}
                    </span>
                  </div>
                  <strong>{draft.title || programme?.title || "Video title"}</strong>
                  <p>{draft.description || "Short promotional text"}</p>
                  <span className="rb-tv-cta">▶ {draft.ctaText || "Watch replay"}</span>
                </div>
              </div>
              <div className="rb-tv-portrait-row">
                <div className="rb-tv-portrait">
                  {tall ? <img src={tall} alt="" /> : <FileImage size={22} />}
                  <span>{draft.title || programme?.title || "Title"}</span>
                </div>
                <ul className="rb-summary">
                  <li>
                    <Users size={14} />{" "}
                    {draft.visibleTo.length
                      ? draft.visibleTo
                          .map(
                            (v) =>
                              PROFILE_TYPES.find((t) => t.id === v)?.label || v,
                          )
                          .join(", ")
                      : "No profiles yet"}
                    {draft.screenGroups.length
                      ? ` · ${draft.screenGroups.join(", ")}`
                      : ""}
                  </li>
                  <li>
                    <CalendarRange size={14} />{" "}
                    {draft.startAt
                      ? new Date(draft.startAt).toLocaleString()
                      : "Now"}{" "}
                    →{" "}
                    {draft.endAt
                      ? new Date(draft.endAt).toLocaleString()
                      : "No end"}
                  </li>
                  <li>
                    <Smartphone size={14} /> Portrait screens use the portrait
                    artwork
                  </li>
                </ul>
              </div>
              <div className="rb-actions">
                <Button
                  variant="secondary"
                  loading={busy}
                  disabled={!canEdit || !programme}
                  onClick={() => save("draft")}
                >
                  Save draft
                </Button>
                {canPublish ? (
                  <Button
                    icon={UploadCloud}
                    loading={busy}
                    disabled={!programme}
                    onClick={() => save("published")}
                  >
                    Publish
                  </Button>
                ) : (
                  <Button
                    loading={busy}
                    disabled={!canEdit || !programme}
                    onClick={() => save("review")}
                  >
                    Send for approval
                  </Button>
                )}
              </div>
            </Card>
          </aside>
        </div>
        {feedback.node}
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="CONTENT MANAGEMENT"
        title="Banners"
        subtitle="Hero banners for the TV Home and Replay pages."
      />
      {tabs}
      <div className="rb-list-head">
        <div>
          <h3>Featured on Replay</h3>
          <p>
            The live banner with the best priority opens the TV Replay page,
            above Continue watching and the programme list.
          </p>
        </div>
        <Button icon={Plus} disabled={!canEdit} onClick={startNew}>
          Add featured programme
        </Button>
      </div>
      <Card className="content-list-card">
        {banners.isLoading ? (
          <Loading />
        ) : banners.error ? (
          <ErrorBox error={banners.error} />
        ) : list.length ? (
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>PROGRAMME</th>
                  <th>SHOWN ON</th>
                  <th>PERIOD</th>
                  <th>PRIORITY</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => {
                  const p = programmes.find((x) => x.id === b.targetId);
                  const art = b.landscapeImage || b.image || p?.image;
                  const live = liveState(b);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="content-name">
                          <div className="table-thumb">
                            {art ? <img src={art} alt="" /> : <FileImage size={18} />}
                          </div>
                          <div>
                            <strong>{b.title}</strong>
                            <small>
                              {b.bannerLabel || "Featured Replay"} ·{" "}
                              {describe(p) || "Video"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="table-muted">
                          {(b.visibleTo || [])
                            .map(
                              (v: string) =>
                                PROFILE_TYPES.find((t) => t.id === v)?.label || v,
                            )
                            .join(", ") || "—"}
                          {b.screenGroups?.length
                            ? ` · ${b.screenGroups.join(", ")}`
                            : ""}
                        </span>
                      </td>
                      <td>
                        <span className="table-muted">
                          {shortDate(b.startAt)} – {shortDate(b.endAt)}
                        </span>
                      </td>
                      <td>{(b.sortOrder ?? 0) + 1}</td>
                      <td>
                        <Status value={b.status} />
                        {live && <small className="rb-live">{live}</small>}
                      </td>
                      <td>
                        <div className="action-cell">
                          <button className="row-action" onClick={() => startEdit(b)}>
                            Edit <Pencil size={13} />
                          </button>
                          <button
                            className="icon-btn hover-danger"
                            title="Delete"
                            disabled={!canEdit}
                            onClick={() => remove(b)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No featured replays yet"
            description="Feature a Video Library video to open the TV Replay page with it."
          />
        )}
      </Card>
      {feedback.node}
    </>
  );
}
