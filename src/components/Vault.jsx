import { useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, SearchInput, Select, Textarea } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import { downloadText, copyText, readStored } from "../lib/store.js";
import { uid } from "../lib/constants.js";

const TAGS = ["Security", "Architecture", "Code snippet", "Research", "Prompt", "Decision", "Other"];

/** Neural Vault: the knowledge base that feeds future runs. */
export default function Vault({ items, setItems, onInjectGoal, onOpenTab }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (tag === "all" || i.tag === tag) &&
          (!query || `${i.title} ${i.content}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [items, query, tag],
  );

  const save = (item) => {
    setItems((prev) => {
      const exists = prev.some((p) => p.id === item.id);
      return exists ? prev.map((p) => (p.id === item.id ? item : p)) : [{ ...item, created_at: new Date().toISOString() }, ...prev];
    });
    setEditing(null);
    toast.success("Saved to the vault");
  };

  const exportJson = () => {
    downloadText(`neural-vault-${Date.now()}.json`, JSON.stringify(items, null, 2), "application/json");
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText);
      const incoming = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(incoming)) throw new Error("Expected a JSON array of items.");
      const clean = incoming
        .filter((i) => i && typeof i.content === "string")
        .map((i) => ({ id: i.id || uid("v"), title: String(i.title || "Imported item").slice(0, 120), content: i.content, tag: TAGS.includes(i.tag) ? i.tag : "Other", created_at: i.created_at || new Date().toISOString(), pinned: Boolean(i.pinned) }));
      setItems((prev) => [...clean, ...prev]);
      toast.success(`Imported ${clean.length} items`);
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      toast.error(`Import failed: ${e.message}`);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Neural Vault</h1>
          <p className="page-sub">
            {items.length} reusable artefacts — decisions, schemas, prompts and audits. Inject any of them into the next goal so the swarm starts with your context.
          </p>
        </div>
        <div className="row gap-8">
          <Button icon="upload" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button icon="download" onClick={exportJson} disabled={!items.length}>
            Export
          </Button>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setEditing({ id: uid("v"), title: "", content: "", tag: "Architecture", pinned: false })}
          >
            New item
          </Button>
        </div>
      </div>

      <div className="toolbar mb-12">
        <SearchInput value={query} onChange={setQuery} placeholder="Search the vault…" className="grow" onClear={() => setQuery("")} />
        <div className="row gap-4 wrap">
          {["all", ...TAGS].map((t) => (
            <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="book" title={items.length ? "Nothing matches that filter" : "The vault is empty"} action={<Button variant="primary" icon="plus" onClick={() => setEditing({ id: uid("v"), title: "", content: "", tag: "Architecture" })}>Add the first item</Button>}>
          Audits, research briefs and architecture decisions are saved here from every desk. They persist in this browser, and export/import as JSON for backups.
        </EmptyState>
      ) : (
        <div className="auto-grid">
          {filtered.map((item) => (
            <Card
              key={item.id}
              title={item.pinned ? `★ ${item.title}` : item.title}
              subtitle={new Date(item.created_at).toLocaleDateString()}
              actions={
                <>
                  <IconButton name={item.pinned ? "star" : "pin"} label="Pin" size={13} onClick={() => setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, pinned: !p.pinned } : p)))} />
                  <IconButton name="edit" label="Edit" size={13} onClick={() => setEditing(item)} />
                  <IconButton name="trash" label="Delete" size={13} onClick={() => setConfirmDelete(item)} />
                </>
              }
            >
              <div className="row gap-6 mb-8">
                <Badge>{item.tag}</Badge>
                <Badge>{item.content.length} chars</Badge>
              </div>
              <pre className="mono tiny muted" style={{ whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto", background: "var(--bg-inset)", borderRadius: "var(--r-sm)", padding: 10, border: "1px solid var(--border-soft)" }}>
                {item.content.slice(0, 600)}
              </pre>
              <div className="row gap-6 mt-12">
                <Button size="sm" icon="send" onClick={() => { onInjectGoal(item.content); onOpenTab?.("swarm"); }}>
                  Inject into goal
                </Button>
                <Button size="sm" variant="ghost" icon="copy" onClick={async () => { if (await copyText(item.content)) toast.success("Copied"); }}>
                  Copy
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={items.some((i) => i.id === editing.id) ? "Edit item" : "New vault item"}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" disabled={!editing.title.trim() || !editing.content.trim()} onClick={() => save(editing)}>
                Save
              </Button>
            </>
          }
        >
          <div className="col gap-12">
            <Field label="Title">
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Supabase RLS baseline policy" />
            </Field>
            <Field label="Tag">
              <Select value={editing.tag} onChange={(e) => setEditing({ ...editing, tag: e.target.value })} options={TAGS} />
            </Field>
            <Field label="Content">
              <Textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} style={{ minHeight: 200, fontFamily: "var(--font-mono)", fontSize: 12.5 }} />
            </Field>
          </div>
        </Modal>
      ) : null}

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import vault JSON"
        subtitle="Merges into the current vault"
        footer={
          <>
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={importJson} disabled={!importText.trim()}>
              Import
            </Button>
          </>
        }
      >
        <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='[{"title":"…","content":"…","tag":"Security"}]' style={{ minHeight: 200, fontFamily: "var(--font-mono)", fontSize: 12 }} />
        <div className="hint mt-8">
          {(() => {
            try {
              const parsed = JSON.parse(importText || "[]");
              const n = Array.isArray(parsed) ? parsed.length : parsed.items?.length;
              return `${n || 0} item(s) detected.`;
            } catch {
              return "Waiting for valid JSON.";
            }
          })()}{" "}
          Backup file from another browser: {readStored("ns.vault", []).length} items currently stored.
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this vault item?"
        body={confirmDelete?.title}
        confirmLabel="Delete"
        onConfirm={() => setItems((prev) => prev.filter((p) => p.id !== confirmDelete.id))}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
