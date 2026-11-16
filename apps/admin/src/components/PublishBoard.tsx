import React, { useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileImage, GripVertical, Trash2 } from "lucide-react";
import type { Resource, Role } from "../types";
import { Empty, Loading, Status } from "./Common";
import "./publish-board.css";

/**
 * Live TV Channels / Radio Stations: two panels. Left lists everything that is
 * not published (the status filter applies here); right lists what the TV shows
 * now. Dragging a card from left to right publishes it; dragging it back sets
 * it to draft. Search filters both panels.
 */
export default function PublishBoard({
  kind,
  items,
  loading,
  search,
  statusFilter,
  role,
  onMove,
  onEdit,
  onDelete,
}: {
  kind: string;
  items: Resource[];
  loading: boolean;
  search: string;
  statusFilter: string;
  role: Role;
  onMove: (item: Resource, status: "published" | "draft") => Promise<void>;
  onEdit: (item: Resource) => void;
  onDelete: (item: Resource) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<"all" | "current" | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const canPublish = role === "admin";
  const radio = kind === "radio";
  const names = radio
    ? { all: "All Radio", current: "Current Radio", noun: "station" }
    : { all: "All Channels", current: "Current Channels", noun: "channel" };
  const q = search.toLowerCase();
  const matches = (v: Resource) =>
    `${v.title || ""} ${v.category || ""} ${v.description || ""}`.toLowerCase().includes(q);
  const byOrder = (a: Resource, b: Resource) =>
    (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || (a.title || "").localeCompare(b.title || "");
  const left = items
    .filter((v) => v.status !== "published" && (statusFilter === "all" || v.status === statusFilter) && matches(v))
    .sort(byOrder);
  const right = items.filter((v) => v.status === "published" && matches(v)).sort(byOrder);

  async function move(item: Resource, to: "all" | "current") {
    const status = to === "current" ? "published" : "draft";
    if ((to === "current") === (item.status === "published")) return;
    setMoving(item.id);
    try {
      await onMove(item, status);
    } finally {
      setMoving(null);
    }
  }
  function drop(to: "all" | "current", e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    const item = items.find((v) => v.id === id);
    if (item) void move(item, to);
  }
  function card(item: Resource, side: "all" | "current") {
    const draggable = canPublish && moving !== item.id;
    return (
      <div
        key={item.id}
        className={"pb-card" + (dragId === item.id ? " is-dragging" : "") + (moving === item.id ? " is-moving" : "")}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(item.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOver(null);
        }}
        data-testid={"pb-card-" + item.id}
      >
        <GripVertical size={16} className="pb-grip" aria-hidden />
        <div className="table-thumb">{item.image ? <img src={item.image} alt="" /> : <FileImage size={18} />}</div>
        <div className="pb-copy">
          <strong>{item.title}</strong>
          <small>{[item.category, item.description].filter(Boolean).join(" · ") || "No description"}</small>
        </div>
        {side === "all" && <Status value={item.status} />}
        <div className="pb-actions">
          <button className="row-action" onClick={() => onEdit(item)}>
            Edit <ArrowUpRight size={14} />
          </button>
          <button
            className="icon-btn hover-danger"
            title="Delete"
            disabled={role === "viewer"}
            onClick={() => onDelete(item)}
          >
            <Trash2 size={16} />
          </button>
          <button
            className="icon-btn pb-move"
            disabled={!draggable}
            title={side === "all" ? `Publish to ${names.current}` : `Move back to ${names.all} as draft`}
            aria-label={side === "all" ? `Publish ${item.title}` : `Unpublish ${item.title}`}
            onClick={() => move(item, side === "all" ? "current" : "all")}
          >
            {side === "all" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
          </button>
        </div>
      </div>
    );
  }
  function panel(side: "all" | "current", list: Resource[]) {
    const title = side === "all" ? names.all : names.current;
    const hint =
      side === "all"
        ? `Drag a ${names.noun} to the right to publish it.`
        : `Published on the TV. Drag back to the left to unpublish.`;
    return (
      <section
        className={"pb-panel pb-" + side + (over === side ? " is-over" : "")}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (over !== side) setOver(side);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
        }}
        onDrop={(e) => drop(side, e)}
        aria-label={title}
        data-testid={"pb-panel-" + side}
      >
        <header className="pb-head">
          <div>
            <h3>{title}</h3>
            <p>{hint}</p>
          </div>
          <span className="total-count">{list.length}</span>
        </header>
        <div className="pb-list">
          {loading ? (
            <Loading />
          ) : list.length ? (
            list.map((item) => card(item, side))
          ) : (
            <div className="pb-empty">
              <Empty
                title={side === "all" ? `No ${names.noun}s waiting` : `Nothing published yet`}
                description={
                  side === "all"
                    ? search || statusFilter !== "all"
                      ? "Change your search or status filter."
                      : `Every ${names.noun} is published.`
                    : search
                      ? "Nothing published matches your search."
                      : `Drag a ${names.noun} here to publish it.`
                }
              />
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <>
      {!canPublish && (
        <div className="pb-note">Only administrators can publish or unpublish by dragging.</div>
      )}
      <div className="pb-board">
        {panel("all", left)}
        {panel("current", right)}
      </div>
    </>
  );
}
