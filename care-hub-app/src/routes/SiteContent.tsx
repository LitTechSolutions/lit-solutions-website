import { useCallback, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "../api/client";
import type { ContentSlug } from "../api/types";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { isPlatformAdminRole } from "../auth/roles";
import { Loading } from "../components/states/Loading";
import { ErrorState } from "../components/states/ErrorState";
import { UnauthorizedState } from "../components/states/UnauthorizedState";
import { SessionExpiredState } from "../components/states/SessionExpiredState";
import { StateScreen } from "../components/states/StateScreen";
import { strings } from "../strings/en";

function SignInAgain() {
  return <SessionExpiredState onSignInAgain={() => window.location.assign("/care-hub/login")} />;
}

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface ContentItem {
  id: string;
  [key: string]: string;
}

interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "image";
  required?: boolean;
  hint?: string;
  rows?: number;
  auto?: (draft: Record<string, string>) => string;
}

interface ContentTypeConfig {
  key: string;
  slug: ContentSlug;
  title: string;
  fields: FieldConfig[];
  itemLabel: (item: ContentItem) => string;
  itemSub: (item: ContentItem) => string;
}

// Mirrors admin.html's own EDITORS config field-for-field, so the record
// shape stored in Netlify Blobs (and read by blog.html/portfolio.html/
// testimonials.html/gallery.html on the public site) never has to change
// -- Care Hub just becomes a second UI writing the exact same records.
const CONTENT_TYPES: ContentTypeConfig[] = [
  {
    key: "posts",
    slug: "blog-posts",
    title: "Blog Posts",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "slug", label: "URL slug", type: "text", required: true, hint: 'Used in the link, e.g. "hello-world"', auto: (d) => slugify(d.title) },
      { key: "category", label: "Category", type: "text", hint: "e.g. Website, Cybersecurity, Networking" },
      { key: "date", label: "Date", type: "date" },
      { key: "excerpt", label: "Short excerpt", type: "textarea", rows: 2, hint: "Shown on the blog list page" },
      { key: "body", label: "Full article", type: "textarea", rows: 10, hint: "Leave a blank line between paragraphs" },
      { key: "imageDataUri", label: "Featured photo (optional)", type: "image" },
    ],
    itemLabel: (item) => item.title || "(untitled post)",
    itemSub: (item) => [item.category, item.date].filter(Boolean).join(" · "),
  },
  {
    key: "portfolio",
    slug: "portfolio-items",
    title: "Portfolio",
    fields: [
      { key: "title", label: "Project title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", rows: 4, required: true },
      { key: "imageDataUri", label: "Photo (optional)", type: "image" },
    ],
    itemLabel: (item) => item.title || "(untitled project)",
    itemSub: (item) => (item.description || "").slice(0, 80),
  },
  {
    key: "testimonials",
    slug: "testimonials",
    title: "Testimonials",
    fields: [
      { key: "quote", label: "Quote", type: "textarea", rows: 3, required: true },
      { key: "author", label: "Author name", type: "text", required: true },
      { key: "roleOrCompany", label: "Role / company (optional)", type: "text" },
    ],
    itemLabel: (item) => item.author || "(unnamed)",
    itemSub: (item) => `"${(item.quote || "").slice(0, 80)}"`,
  },
  {
    key: "gallery",
    slug: "gallery-images",
    title: "Gallery",
    fields: [
      { key: "imageDataUri", label: "Photo", type: "image", required: true },
      { key: "altText", label: "Alt text", type: "text", required: true, hint: "Describes the photo for screen readers -- required for every gallery image" },
      { key: "caption", label: "Caption (optional)", type: "text" },
    ],
    itemLabel: (item) => item.altText || "(untitled photo)",
    itemSub: (item) => item.caption || "",
  },
];

/**
 * Migrated from admin.html's "Staff Sign In" panel -- previously the only
 * place any of this could be managed. One generic, config-driven editor
 * (mirroring admin.html's own makeListEditorView() factory) shared across
 * all 4 content types via an in-page tab switcher, rather than 4 separate
 * near-identical components.
 */
export function SiteContent() {
  const { state: authState } = useAuth();
  const isPlatformAdmin = authState.status === "signedIn" && isPlatformAdminRole(authState.user.role);

  if (!isPlatformAdmin) {
    return (
      <StateScreen
        variant="notice"
        icon="—"
        title={strings.siteContent.notPlatformAdminTitle}
        body={strings.siteContent.notPlatformAdminBody}
      />
    );
  }

  return <StaffSiteContent />;
}

function StaffSiteContent() {
  const [activeKey, setActiveKey] = useState(CONTENT_TYPES[0].key);
  const activeConfig = CONTENT_TYPES.find((c) => c.key === activeKey) || CONTENT_TYPES[0];

  return (
    <div>
      <h1>{strings.siteContent.title}</h1>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-4)" }} role="tablist" aria-label="Content type">
        {CONTENT_TYPES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={c.key === activeKey}
            className={c.key === activeKey ? "btn btn-primary btn-small" : "btn btn-ghost btn-small"}
            onClick={() => setActiveKey(c.key)}
          >
            {c.title}
          </button>
        ))}
      </div>
      <ContentEditor key={activeConfig.slug} config={activeConfig} />
    </div>
  );
}

function ContentEditor({ config }: { config: ContentTypeConfig }) {
  const fetchContent = useCallback(() => api.content.get<ContentItem>(config.slug), [config.slug]);
  const state = useApi(fetchContent, [config.slug]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "expired") return <SignInAgain />;
  if (state.status === "unauthorized") return <UnauthorizedState />;
  if (state.status === "error") return <ErrorState body={state.message} onRetry={state.retry} />;

  const initialItems = state.status === "success" ? state.data.data : [];
  return <ContentList config={config} initialItems={initialItems} />;
}

type StatusKind = "" | "ok" | "error" | "pending";
interface StatusMessage {
  kind: StatusKind;
  text: string;
}

function ContentList({ config, initialItems }: { config: ContentTypeConfig; initialItems: ContentItem[] }) {
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [formStatus, setFormStatus] = useState<StatusMessage>({ kind: "", text: "" });
  const [listStatus, setListStatus] = useState<StatusMessage>({ kind: "", text: "" });

  // Every add/edit/delete/reorder auto-saves the full array right away --
  // there's no separate "publish" step, matching admin.html's own
  // behavior exactly (content.js always overwrites the whole array).
  async function persist(nextItems: ContentItem[], setStatus: (s: StatusMessage) => void, savedMessage: string, rollback?: () => void) {
    setStatus({ kind: "pending", text: strings.siteContent.savingStatus });
    try {
      await api.content.save(config.slug, nextItems);
      setStatus({ kind: "ok", text: savedMessage });
    } catch (err) {
      const message = err instanceof Error ? err.message : strings.siteContent.saveErrorFallback;
      if (rollback) rollback();
      setStatus({ kind: "error", text: message });
    }
  }

  function startEdit(item: ContentItem) {
    setEditingId(item.id);
    const d: Record<string, string> = {};
    config.fields.forEach((f) => {
      d[f.key] = item[f.key] || "";
    });
    setDraft(d);
    setFormStatus({ kind: "", text: "" });
  }

  function startAdd() {
    setEditingId(null);
    setDraft({});
    setFormStatus({ kind: "", text: "" });
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const out: Record<string, string> = {};
    config.fields.forEach((f) => {
      out[f.key] = draft[f.key] || "";
    });
    // Auto-filled fields (e.g. a blog post's slug from its title) are
    // computed before the required check below -- so a field with a
    // fallback is never wrongly reported as "missing" just because the
    // admin didn't type it by hand themselves.
    config.fields.forEach((f) => {
      if (f.auto && !out[f.key]) out[f.key] = f.auto(out);
    });
    const missing = config.fields.filter((f) => f.required && !out[f.key]).map((f) => f.label);
    if (missing.length) {
      setFormStatus({ kind: "error", text: strings.siteContent.missingFieldsPrefix + missing.join(", ") });
      return;
    }

    const wasEditing = !!editingId;
    const nextItems = editingId
      ? items.map((i) => (i.id === editingId ? { ...i, ...out } : i))
      : [...items, { id: uid(), ...out }];
    setItems(nextItems);
    setEditingId(null);
    setDraft({});
    // No rollback on purpose: if the save fails, the freshly-entered item
    // stays visible with an error rather than reverting the form and
    // losing what was just typed.
    persist(nextItems, setFormStatus, (wasEditing ? "Updated" : "Added") + " " + strings.siteContent.savedStatus);
  }

  function handleDelete(item: ContentItem) {
    if (!window.confirm(strings.siteContent.deleteConfirm(config.itemLabel(item)))) return;
    const prevItems = items;
    const nextItems = items.filter((i) => i.id !== item.id);
    setItems(nextItems);
    persist(nextItems, setListStatus, strings.siteContent.deletedStatus, () => setItems(prevItems));
  }

  function move(idx: number, dir: -1 | 1) {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const prevItems = items;
    const nextItems = items.slice();
    const tmp = nextItems[idx];
    nextItems[idx] = nextItems[swapIdx];
    nextItems[swapIdx] = tmp;
    setItems(nextItems);
    persist(nextItems, setListStatus, strings.siteContent.reorderedStatus, () => setItems(prevItems));
  }

  return (
    <div>
      <div className="card" style={{ marginTop: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.05rem" }}>{editingId ? strings.siteContent.editItemHeading : strings.siteContent.addNewHeading}</h2>
        <form onSubmit={handleSave}>
          {config.fields.map((f) => (
            <ContentFieldInput key={f.key} field={f} value={draft[f.key] || ""} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
          ))}
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            <button type="submit" className="btn btn-primary btn-small">
              {editingId ? strings.siteContent.updateButton : strings.siteContent.addButton}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={startAdd}>
                {strings.siteContent.cancelEditButton}
              </button>
            ) : null}
          </div>
          {formStatus.text ? (
            <p
              role={formStatus.kind === "error" ? "alert" : "status"}
              style={{ marginTop: "var(--space-2)", fontSize: "0.85rem", color: formStatus.kind === "error" ? "var(--error-text)" : "var(--ink-soft)" }}
            >
              {formStatus.text}
            </p>
          ) : null}
        </form>
      </div>

      <div className="card" style={{ marginTop: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.05rem" }}>{strings.siteContent.currentItemsHeading}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>{strings.siteContent.currentItemsNote}</p>
        {items.length === 0 ? (
          <p style={{ color: "var(--ink-faint)", fontSize: "0.9rem", marginTop: "var(--space-3)" }}>{strings.siteContent.emptyBody}</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            {items.map((item, idx) => (
              <li key={item.id} className="card" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                {item.imageDataUri ? (
                  <img
                    src={item.imageDataUri}
                    alt=""
                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius)", flexShrink: 0 }}
                  />
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{config.itemLabel(item)}</strong>
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{config.itemSub(item)}</p>
                </div>
                <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0 }}>
                  <button type="button" className="btn btn-ghost btn-small" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label={strings.siteContent.moveUp}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    disabled={idx === items.length - 1}
                    onClick={() => move(idx, 1)}
                    aria-label={strings.siteContent.moveDown}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => startEdit(item)}>
                    {strings.siteContent.editButton}
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => handleDelete(item)}>
                    {strings.siteContent.deleteButton}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {listStatus.text ? (
          <p
            role={listStatus.kind === "error" ? "alert" : "status"}
            style={{ marginTop: "var(--space-3)", fontSize: "0.85rem", color: listStatus.kind === "error" ? "var(--error-text)" : "var(--ink-soft)" }}
          >
            {listStatus.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ContentFieldInput({ field, value, onChange }: { field: FieldConfig; value: string; onChange: (v: string) => void }) {
  const id = `content-field-${field.key}`;
  return (
    <div className="field" style={{ marginTop: "var(--space-3)" }}>
      <label htmlFor={id}>
        {field.label}
        {field.hint ? <span style={{ display: "block", fontWeight: 400, color: "var(--ink-faint)", fontSize: "0.8rem" }}>{field.hint}</span> : null}
      </label>
      {field.type === "textarea" ? (
        <textarea id={id} rows={field.rows || 4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "date" ? (
        <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "image" ? (
        <ImageFieldInput id={id} value={value} onChange={onChange} />
      ) : (
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ImageFieldInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) {
      setError(strings.siteContent.imageTooLarge);
      e.target.value = "";
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input id={id} type="file" accept="image/*" onChange={handleFile} />
      {value ? (
        <div style={{ marginTop: "var(--space-2)" }}>
          <img src={value} alt="" style={{ maxWidth: 160, borderRadius: "var(--radius)", display: "block" }} />
          <button type="button" className="btn btn-ghost btn-small" style={{ marginTop: "var(--space-2)" }} onClick={() => onChange("")}>
            {strings.siteContent.removePhotoButton}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
