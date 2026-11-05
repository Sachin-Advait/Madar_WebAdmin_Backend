import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Form from "@rjsf/core";
import validator from "../form-validator";
import {
  Copy,
  GripVertical,
  History,
  Layers3,
  Monitor,
  Plus,
  Save,
  Settings2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { API } from "../api";
import type { Catalog, LayoutSection, PageLayout, Role } from "../types";
import {
  Button,
  Empty,
  ErrorBox,
  FormField,
  Loading,
  PageHeading,
  useFeedback,
} from "../components/Common";
import { TVFrame, WidgetCard } from "../components/TVWidgets";
import {
  HubFooter,
  HubHeader,
  HubRange,
  HubWidget,
} from "../components/InfoHub";
import {
  HUB_PAGE,
  HUB_TAB_OF,
  HUB_WIDE,
  HubTabId,
  hubApi,
  isHubType,
  withInfoHub,
} from "../infoHubData";

const PREVIEW_PREFIX = "preview:";
const PALETTE_PREFIX = "palette:";
const normId = (id: string | number) => String(id).replace(PREVIEW_PREFIX, "");

function NewWidget({
  type,
  label,
  onAdd,
  disabled,
}: {
  type: string;
  label: string;
  onAdd: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${type}`,
    data: { type },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={`palette-widget ${isDragging ? "palette-dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="palette-drag-handle" title="Drag into canvas">
        <GripVertical size={16} />
      </span>
      <span className="palette-symbol">▦</span>
      <span className="palette-name">{label}</span>
      <button
        type="button"
        className="mini-add"
        title={`Add ${label}`}
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onAdd}
      >
        <Plus size={17} />
      </button>
    </div>
  );
}

function SortableSection({
  section,
  selected,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
  readOnly,
}: {
  section: LayoutSection;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  readOnly: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: section.id, disabled: readOnly });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      className={`section-editor-card ${selected ? "selected" : ""} ${isDragging ? "drag-active" : ""} ${isOver && !isDragging ? "drop-target" : ""} ${!section.enabled ? "is-disabled" : ""}`}
      style={style}
      onClick={onSelect}
    >
      <span
        className="drag-handle"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical size={19} />
      </span>
      <div className="section-card-text">
        <strong>
          {String(section.props.title || section.type.replaceAll("_", " "))}
        </strong>
        <small>
          {section.type} · {section.enabled ? "Visible" : "Hidden"}
        </small>
      </div>
      <div className="section-controls">
        <button
          title={section.enabled ? "Hide" : "Show"}
          disabled={readOnly}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`small-toggle ${section.enabled ? "on" : ""}`}
        ></button>
        <button
          title="Duplicate"
          disabled={readOnly}
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy size={15} />
        </button>
        <button
          title="Remove"
          disabled={readOnly}
          className="icon-btn hover-danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function PreviewSortable({
  id,
  selected,
  onSelect,
  readOnly,
  className = "",
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  readOnly: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: `${PREVIEW_PREFIX}${id}`, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      className={`preview-select ${className} ${selected ? "is-selected" : ""} ${isDragging ? "drag-active" : ""} ${isOver && !isDragging ? "drop-target" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: readOnly ? "pointer" : "grab",
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function DropZone({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "is-over" : ""}`}>
      {children}
    </div>
  );
}

export default function PageBuilder({
  catalog: baseCatalog,
  role,
}: {
  catalog: Catalog;
  role: Role;
}) {
  const catalog = useMemo(() => withInfoHub(baseCatalog), [baseCatalog]);
  const canEdit = role !== "viewer",
    canPublish = role === "admin";
  const [page, setPage] = useState("home"),
    [profile, setProfile] = useState("management");
  const isHub = page === HUB_PAGE;
  const [hubTab, setHubTab] = useState<HubTabId>("live");
  const [hubRange, setHubRange] = useState<HubRange>("today");
  const [sections, setSections] = useState<LayoutSection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<number | "">("");
  const feedback = useFeedback();
  const client = useQueryClient();
  const {
    data: response,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["layout", page, profile],
    queryFn: () => (isHub ? hubApi.layout(profile) : API.layout(page, profile)),
  });
  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: API.profiles,
  });
  const { data: versions } = useQuery({
    queryKey: ["versions", page, profile],
    queryFn: () =>
      isHub ? hubApi.versions(profile) : API.versions(page, profile),
  });
  const { data: preview } = useQuery({
    queryKey: ["preview", page, profile, "draft"],
    queryFn: () => API.preview(page, profile, "draft"),
    enabled: !isHub,
  });
  useEffect(() => {
    if (!response) return;
    setSections(
      response.draft.sections.map((s) => ({
        ...s,
        props: { ...s.props },
        layout: { ...s.layout },
      })),
    );
    setDirty(false);
    setSelectedId(response.draft.sections[0]?.id || null);
    setHubTab("live");
  }, [response]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const selected = sections.find((s) => s.id === selectedId) || null;
  const allowed = catalog.pageWidgets[page] || [];
  const enabledSections = sections.filter((s) => s.enabled);
  const previewSections = isHub
    ? enabledSections.filter((s) => HUB_TAB_OF[s.type] === hubTab)
    : enabledSections;
  const profileName =
    (profiles || []).find((p) => p.id === profile)?.name || "Management";

  function modify(update: (s: LayoutSection[]) => LayoutSection[]) {
    setSections((current) =>
      update(current).map((s, i) => ({ ...s, order: i })),
    );
    setDirty(true);
  }
  function pick(id: string) {
    setSelectedId(id);
    const s = sections.find((x) => x.id === id);
    if (s && isHubType(s.type)) setHubTab(HUB_TAB_OF[s.type]);
  }
  function addWidget(type: string, at?: number) {
    if (!canEdit) return;
    const info = catalog.widgets[type];
    if (!info) return;
    const newItem: LayoutSection = {
      id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
      type,
      enabled: true,
      order: sections.length,
      props: { ...info.defaults },
      layout: {
        x: 0,
        y: sections.length * 4,
        w: HUB_WIDE[type] ? 12 : info.grid ? 6 : 12,
        h: 4,
      },
    };
    modify((old) => {
      const n = [...old];
      n.splice(at ?? n.length, 0, newItem);
      return n;
    });
    setSelectedId(newItem.id);
    if (isHubType(type)) setHubTab(HUB_TAB_OF[type]);
  }
  function dragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  function dragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!canEdit) return;
    const a = normId(event.active.id);
    const over = event.over?.id ? normId(event.over.id) : null;
    if (!over) return;
    if (a.startsWith(PALETTE_PREFIX)) {
      const type = a.replace(PALETTE_PREFIX, "");
      const idx = sections.findIndex((s) => s.id === over);
      addWidget(type, idx < 0 ? undefined : idx);
      return;
    }
    const from = sections.findIndex((s) => s.id === a),
      to = sections.findIndex((s) => s.id === over);
    if (from !== -1 && to !== -1 && from !== to)
      modify((current) => arrayMove(current, from, to));
  }
  function changeSection(id: string, update: Partial<LayoutSection>) {
    modify((old) => old.map((s) => (s.id === id ? { ...s, ...update } : s)));
  }
  async function save() {
    if (!response) return;
    setSaving(true);
    try {
      const layout: PageLayout = { schemaVersion: 1, pageKey: page, sections };
      const result = await (isHub
        ? hubApi.saveLayout(profile, layout, response.revision)
        : API.saveLayout(page, profile, layout, response.revision));
      feedback.success(`Draft saved • revision ${result.revision}`);
      await client.invalidateQueries({ queryKey: ["layout", page, profile] });
      await client.invalidateQueries({ queryKey: ["preview", page, profile] });
    } catch (e) {
      feedback.error(e);
    } finally {
      setSaving(false);
    }
  }
  async function publish() {
    if (!response) return;
    setSaving(true);
    try {
      const r = await (isHub
        ? hubApi.publish(profile, response.revision)
        : API.publish(page, profile, response.revision));
      feedback.success(
        `Published version ${r.publishedVersion} to ${profile} screens`,
      );
      await client.invalidateQueries({ queryKey: ["layout", page, profile] });
      await client.invalidateQueries({ queryKey: ["versions", page, profile] });
    } catch (e) {
      feedback.error(e);
    } finally {
      setSaving(false);
    }
  }
  async function restore() {
    if (versionToRestore === "") return;
    try {
      await (isHub
        ? hubApi.rollback(profile, Number(versionToRestore), response!.revision)
        : API.rollback(
            page,
            profile,
            Number(versionToRestore),
            response!.revision,
          ));
      feedback.success(
        "Older version restored to draft. Review and publish when ready.",
      );
      await client.invalidateQueries({ queryKey: ["layout", page, profile] });
    } catch (e) {
      feedback.error(e);
    }
  }

  const activeNorm = activeId ? normId(activeId) : null;
  const overlayPalette = activeNorm?.startsWith(PALETTE_PREFIX)
    ? activeNorm.replace(PALETTE_PREFIX, "")
    : null;
  const overlaySection = activeNorm
    ? sections.find((s) => s.id === activeNorm)
    : null;

  return (
    <>
      <PageHeading
        eyebrow="TV EXPERIENCE / VISUAL EDITOR"
        title="Page Builder"
        subtitle="Arrange sections, configure their appearance, review changes and publish to your screens."
      >
        <div className="version-display">
          Published v{response?.publishedVersion || 0}
        </div>
        <Button
          variant="secondary"
          icon={Save}
          loading={saving}
          disabled={!dirty || !canEdit}
          onClick={save}
        >
          Save draft
        </Button>
        <Button
          icon={UploadCloud}
          loading={saving}
          disabled={!canPublish || dirty || !response}
          onClick={publish}
        >
          Publish layout
        </Button>
      </PageHeading>
      <div className="workspace-toolbar">
        <FormField label="PAGE">
          <select value={page} onChange={(e) => setPage(e.target.value)}>
            {Object.entries(catalog.pages).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="DISPLAY PROFILE">
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {(profiles || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <span className="toolbar-stat">
          {sections.length} sections <b>·</b> {enabledSections.length} visible
        </span>
        <span className={`dirty-label ${dirty ? "is-dirty" : ""}`}>
          {dirty ? "● Unsaved changes" : "✓ Draft saved"}
        </span>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={dragStart}
          onDragEnd={dragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="builder-layout">
            <aside className="panel builder-palette">
              <div className="panel-header">
                <h3>
                  <Layers3 size={16} /> Widget Library
                </h3>
                <p>Drag onto the canvas or preview, or press +</p>
              </div>
              <div className="palette-list">
                {allowed.map((type) => (
                  <NewWidget
                    type={type}
                    key={type}
                    label={catalog.widgets[type]?.label || type}
                    disabled={!canEdit}
                    onAdd={() => addWidget(type)}
                  />
                ))}
              </div>
              <div className="panel-hint">
                Choose from supported display widgets to keep your screens
                consistent.
              </div>
              <div className="panel-header second">
                <h3>Layout canvas</h3>
                <p>Selected page: {catalog.pages[page]}</p>
              </div>
              <DropZone id="page-canvas" className="layout-drop-zone">
                <SortableContext
                  items={sections.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="section-sort-list">
                    {sections.map((s) => (
                      <SortableSection
                        key={s.id}
                        section={s}
                        selected={selectedId === s.id}
                        onSelect={() => pick(s.id)}
                        onToggle={() =>
                          changeSection(s.id, { enabled: !s.enabled })
                        }
                        onDuplicate={() => {
                          const idx = sections.findIndex((x) => x.id === s.id);
                          const item = {
                            ...s,
                            id: `${s.type}-${crypto.randomUUID().slice(0, 8)}`,
                            props: { ...s.props },
                            layout: { ...s.layout },
                          };
                          modify((old) => {
                            const n = [...old];
                            n.splice(idx + 1, 0, item);
                            return n;
                          });
                        }}
                        onDelete={() => {
                          modify((old) => old.filter((x) => x.id !== s.id));
                          if (selectedId === s.id) setSelectedId(null);
                        }}
                        readOnly={!canEdit}
                      />
                    ))}
                  </div>
                </SortableContext>
                {!sections.length && (
                  <Empty
                    title="No sections yet"
                    description="Drag a widget from above, or click its plus button."
                  />
                )}
              </DropZone>
            </aside>
            <div className="panel builder-preview">
              <div className="panel-header inline">
                <div>
                  <h3>
                    <Monitor size={17} /> Live TV canvas
                  </h3>
                  <p>Drag widgets here or reorder • 16:9 TV viewport</p>
                </div>
                <span className="preview-tag">DRAFT</span>
              </div>
              <div className="tv-preview-wrap">
                <TVFrame
                  page={catalog.pages[page]?.split(" / ")[0] || "Home"}
                  demo={catalog.demo}
                >
                  <DropZone id="preview-canvas" className="preview-drop-zone">
                    {isHub && (
                      <HubHeader
                        tab={hubTab}
                        onTab={setHubTab}
                        range={hubRange}
                        onRange={setHubRange}
                        context={`${profileName} display · Headquarters`}
                      />
                    )}
                    <SortableContext
                      items={previewSections.map(
                        (s) => `${PREVIEW_PREFIX}${s.id}`,
                      )}
                      strategy={
                        isHub
                          ? rectSortingStrategy
                          : verticalListSortingStrategy
                      }
                    >
                      <div className={isHub ? "hub-grid" : undefined}>
                        {previewSections.map((s) => (
                          <PreviewSortable
                            key={s.id}
                            id={s.id}
                            selected={selectedId === s.id}
                            onSelect={() => pick(s.id)}
                            readOnly={!canEdit}
                            className={HUB_WIDE[s.type] ? "hub-wide" : ""}
                          >
                            {isHubType(s.type) ? (
                              <HubWidget section={s} range={hubRange} />
                            ) : (
                              <WidgetCard
                                compact
                                section={{
                                  ...s,
                                  source: catalog.widgets[s.type]?.source || "",
                                  data:
                                    preview?.sections.find((v) => v.id === s.id)
                                      ?.data ?? [],
                                }}
                              />
                            )}
                          </PreviewSortable>
                        ))}
                      </div>
                    </SortableContext>
                    {!previewSections.length && (
                      <div className="preview-drop-hint">
                        Drop a widget here
                      </div>
                    )}
                    {isHub && <HubFooter />}
                  </DropZone>
                </TVFrame>
              </div>
              <div className="canvas-bottom">
                <p>
                  Layout preview reflects the current arrangement of this draft.
                  Publish to push it to your screens.
                </p>
                <div className="history-row">
                  <History size={17} />
                  <select
                    value={versionToRestore}
                    onChange={(e) =>
                      setVersionToRestore(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                  >
                    <option value="">Published history</option>
                    {(versions || []).map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version} –{" "}
                        {new Date(v.publishedAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    disabled={versionToRestore === "" || !canPublish}
                    onClick={restore}
                  >
                    Restore to draft
                  </Button>
                </div>
              </div>
            </div>
            <aside className="panel builder-properties">
              <div className="panel-header">
                <h3>
                  <Settings2 size={17} /> Widget Properties
                </h3>
                <p>
                  {selected
                    ? catalog.widgets[selected.type]?.label || selected.type
                    : "Select any section to edit"}
                </p>
              </div>
              {selected ? (
                <div className="properties-body">
                  <div className="property-meta">
                    <span>COMPONENT TYPE</span>
                    <code>{selected.type}</code>
                  </div>
                  <div className="property-meta">
                    <span>DATA SOURCE</span>
                    <code>{catalog.widgets[selected.type]?.source}</code>
                  </div>
                  <div className="property-meta">
                    <span>FLUTTER WIDGET ID</span>
                    <code>{selected.id}</code>
                  </div>
                  <div className="props-form">
                    <Form
                      schema={
                        catalog.widgets[selected.type]?.schema || {
                          type: "object",
                        }
                      }
                      validator={validator}
                      disabled={!canEdit}
                      formData={selected.props}
                      onChange={(e) =>
                        changeSection(selected.id, {
                          props: e.formData as Record<string, unknown>,
                        })
                      }
                      onSubmit={(e) =>
                        changeSection(selected.id, {
                          props: e.formData as Record<string, unknown>,
                        })
                      }
                      showErrorList={false}
                    >
                      <></>
                    </Form>
                  </div>
                  <div className="properties-note">
                    Widget settings are checked again by the API before saving.
                    Publishing requires Admin permission.
                  </div>
                </div>
              ) : (
                <Empty
                  title="Select a widget"
                  description="Choose a section from the canvas to edit its properties."
                />
              )}
            </aside>
          </div>
          <DragOverlay dropAnimation={{ duration: 180 }}>
            {overlayPalette ? (
              <div className="palette-widget palette-overlay">
                <span className="palette-symbol">▦</span>
                <span className="palette-name">
                  {catalog.widgets[overlayPalette]?.label || overlayPalette}
                </span>
              </div>
            ) : overlaySection ? (
              <div className="section-editor-card selected palette-overlay">
                <span className="drag-handle">
                  <GripVertical size={19} />
                </span>
                <div className="section-card-text">
                  <strong>
                    {String(
                      overlaySection.props.title ||
                        overlaySection.type.replaceAll("_", " "),
                    )}
                  </strong>
                  <small>{overlaySection.type}</small>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      {feedback.node}
    </>
  );
}
