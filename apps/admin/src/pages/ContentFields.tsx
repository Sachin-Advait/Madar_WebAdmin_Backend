import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Plus, Save, Trash2 } from "lucide-react";
import { request } from "../api";
import { Button, Card, PageHeading, useFeedback } from "../components/Common";
import type { Catalog, Role } from "../types";

const ACCENT = "#6b5837";
const ACCENT_SOFT = "#f1ebe0";
const LINE = "#e6e0d4";
const FIELD_LINE = "#dcd5c7";
const SOFT = "#faf7f2";
const INK = "#2b3138";
const MUTED = "#8d949b";

const FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "boolean",
  "date",
  "url",
  "select",
];

const S: Record<string, React.CSSProperties> = {
  toolbar: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    padding: "22px 24px",
    borderBottom: `1px solid ${LINE}`,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "flex-end",
    gap: 14,
    flexWrap: "wrap",
  },
  count: {
    fontSize: 11,
    fontWeight: 700,
    color: MUTED,
    background: SOFT,
    border: `1px solid ${LINE}`,
    borderRadius: 999,
    padding: "8px 12px",
  },
  field: { display: "grid", gap: 6, minWidth: 0, margin: 0 },
  caption: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: MUTED,
  },
  input: {
    width: "100%",
    minWidth: 0,
    height: 42,
    padding: "0 12px",
    border: `1px solid ${FIELD_LINE}`,
    borderRadius: 9,
    background: "#fff",
    color: INK,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color .15s, box-shadow .15s",
  },
  mono: {
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    fontSize: 12,
  },
  select: {
    appearance: "none",
    WebkitAppearance: "none",
    paddingRight: 36,
    cursor: "pointer",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b5837' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  },
  textarea: {
    height: "auto",
    minHeight: 84,
    padding: "10px 12px",
    resize: "vertical",
    lineHeight: 1.5,
  },
  list: { display: "grid", gap: 12, padding: "20px 24px 24px" },
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
    alignItems: "end",
    padding: 16,
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    background: SOFT,
  },
  rowWide: { gridColumn: "1 / -1" },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 42,
    padding: "0 14px",
    border: `1px solid ${FIELD_LINE}`,
    borderRadius: 999,
    background: "#fff",
    color: "#5d6873",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    userSelect: "none",
    margin: 0,
    boxSizing: "border-box",
    transition: "background .15s, border-color .15s, color .15s",
  },
  toggleOn: { background: ACCENT_SOFT, borderColor: ACCENT, color: ACCENT },
  check: {
    width: 15,
    height: 15,
    margin: 0,
    accentColor: ACCENT,
    cursor: "pointer",
  },
  remove: {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    border: `1px solid ${FIELD_LINE}`,
    borderRadius: 9,
    background: "#fff",
    color: "#9a8f7c",
    cursor: "pointer",
    justifySelf: "start",
    transition: "background .15s, border-color .15s, color .15s",
  },
  removeHover: {
    background: "#fff1f0",
    borderColor: "#f1c5bd",
    color: "#b9473d",
  },
  empty: {
    display: "grid",
    justifyItems: "center",
    gap: 10,
    margin: 24,
    padding: "40px 20px",
    border: "1px dashed #d8d0c0",
    borderRadius: 12,
    background: SOFT,
    color: MUTED,
    fontSize: 13,
    lineHeight: 1.7,
    textAlign: "center",
  },
};

const focusOn = (e: React.FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = ACCENT;
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(107,88,55,.14)";
};
const focusOff = (e: React.FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = FIELD_LINE;
  e.currentTarget.style.boxShadow = "none";
};
const focusProps = { onFocus: focusOn, onBlur: focusOff };

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label style={{ ...S.toggle, ...(checked ? S.toggleOn : null) }}>
      <input
        type="checkbox"
        style={S.check}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={"Remove " + label}
      title="Remove field"
      style={{ ...S.remove, ...(hover ? S.removeHover : null) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <Trash2 size={17} />
    </button>
  );
}

export default function ContentFields({
  catalog,
  role,
}: {
  catalog: Catalog;
  role: Role;
}) {
  const [kind, setKind] = useState("notices"),
    [fields, setFields] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  const feedback = useFeedback(),
    client = useQueryClient();
  const def = (catalog as any).fieldDefinitions?.[kind] || {
    fields: [],
    revision: 0,
  };
  useEffect(() => setFields(structuredClone(def.fields)), [kind, catalog]);
  const patch = (i: number, k: string, v: any) =>
    setFields((items) => items.map((f, n) => (n === i ? { ...f, [k]: v } : f)));
  async function save() {
    setBusy(true);
    try {
      await request("/api/admin/content-types/" + kind, {
        method: "PUT",
        body: JSON.stringify({ fields, expectedRevision: def.revision }),
      });
      await client.invalidateQueries({ queryKey: ["catalog"] });
      feedback.success(
        "Fields saved. Content forms and TV details will use the new definition.",
      );
    } catch (e) {
      feedback.error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CONTENT MODEL"
        title="Make room for more information."
        subtitle="Add typed fields without changing application code. Existing content is validated before a definition changes."
      >
        <Button
          icon={Save}
          disabled={role !== "admin"}
          loading={busy}
          onClick={save}
        >
          Save fields
        </Button>
      </PageHeading>
      <Card>
        <div className="list-toolbar" style={S.toolbar}>
          <div style={S.toolbarLeft}>
            <label style={S.field}>
              <span style={S.caption}>Content section</span>
              <select
                style={{ ...S.input, ...S.select, minWidth: 250 }}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                {...focusProps}
              >
                {Object.entries(catalog.resources).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              icon={Plus}
              variant="secondary"
              disabled={role !== "admin" || fields.length >= 24}
              onClick={() =>
                setFields([
                  ...fields,
                  {
                    key: "field" + (fields.length + 1),
                    label: "New field",
                    labelAr: "",
                    type: "text",
                    required: false,
                    showOnTv: true,
                    options: [],
                  },
                ])
              }
            >
              Add field
            </Button>
          </div>
          <span style={S.count}>{fields.length} / 24 fields</span>
        </div>

        {fields.length > 0 && (
          <div style={S.list}>
            {fields.map((f, i) => (
              <div style={S.row} key={i}>
                <label style={S.field}>
                  <span style={S.caption}>Stable key</span>
                  <input
                    style={{ ...S.input, ...S.mono }}
                    value={f.key}
                    onChange={(e) => patch(i, "key", e.target.value)}
                    {...focusProps}
                  />
                </label>
                <label style={S.field}>
                  <span style={S.caption}>Label</span>
                  <input
                    style={S.input}
                    value={f.label}
                    onChange={(e) => patch(i, "label", e.target.value)}
                    {...focusProps}
                  />
                </label>
                <label style={S.field}>
                  <span style={S.caption}>Arabic label</span>
                  <input
                    style={S.input}
                    dir="rtl"
                    value={f.labelAr}
                    onChange={(e) => patch(i, "labelAr", e.target.value)}
                    {...focusProps}
                  />
                </label>
                <label style={S.field}>
                  <span style={S.caption}>Type</span>
                  <select
                    style={{ ...S.input, ...S.select }}
                    value={f.type}
                    onChange={(e) => patch(i, "type", e.target.value)}
                    {...focusProps}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <Toggle
                  checked={f.required}
                  onChange={(v) => patch(i, "required", v)}
                >
                  Required
                </Toggle>
                <Toggle
                  checked={f.showOnTv}
                  onChange={(v) => patch(i, "showOnTv", v)}
                >
                  Show on TV
                </Toggle>
                <RemoveButton
                  label={f.label}
                  onClick={() => setFields(fields.filter((_, n) => n !== i))}
                />
                {f.type === "select" && (
                  <label style={{ ...S.field, ...S.rowWide }}>
                    <span style={S.caption}>Choices, one per line</span>
                    <textarea
                      style={{ ...S.input, ...S.textarea }}
                      value={f.options.join("\n")}
                      onChange={(e) =>
                        patch(
                          i,
                          "options",
                          e.target.value.split("\n").filter(Boolean),
                        )
                      }
                      {...focusProps}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {!fields.length && (
          <div style={S.empty}>
            <Inbox size={30} color="#b5a78a" />
            <p style={{ maxWidth: 560, margin: 0 }}>
              Standard fields are already available. Add information such as a
              service fee, booking reference, accessibility note or equipment
              list.
            </p>
          </div>
        )}
      </Card>
      <div className="info-strip">
        Make new fields optional when existing content has no value. TV fields
        appear in content details. Internal fields are excluded from device
        releases. Standard safety and publishing fields remain controlled by the
        system.
      </div>
      {feedback.node}
    </>
  );
}
