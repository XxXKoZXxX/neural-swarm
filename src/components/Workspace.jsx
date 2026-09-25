import { useMemo, useState } from "react";
import { Badge, Button, ConfirmDialog, EmptyState, Field, IconButton, Input, SearchInput, Select } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { Icon } from "./icons.jsx";
import { copyText, downloadBlob, downloadText, zipFiles } from "../lib/store.js";

const LANGS = ["text", "js", "jsx", "ts", "tsx", "html", "css", "scss", "json", "yaml", "md", "sql", "py", "sh", "go", "rs", "prisma", "graphql", "dockerfile", "env"];

/**
 * Multi-file workspace: everything the swarm wrote, editable and exportable
 * as a ZIP. Cursor/Windsurf-style split of tree + editor.
 */
export default function Workspace({ files, stats, addFile, updateFile, renameFile, removeFile, clearAll, onOpenTab, routePath }) {
  const toast = useToast();
  const isMobile = useIsMobile();
  // Deep links (#/files?path=src/app.js) win over the first file on load.
  const [selected, setSelected] = useState(() => routePath || files[0]?.path || null);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newLang, setNewLang] = useState("ts");
  const [renaming, setRenaming] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const active = files.find((f) => f.path === selected) || files[0] || null;

  const grouped = useMemo(() => {
    const filtered = files.filter((f) => !query || f.path.toLowerCase().includes(query.toLowerCase()) || f.code.toLowerCase().includes(query.toLowerCase()));
    const groups = new Map();
    for (const f of filtered) {
      const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : ".";
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(f);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [files, query]);

  const downloadZip = () => {
    if (!files.length) return;
    downloadBlob(`neural-swarm-project-${Date.now()}.zip`, zipFiles(files.map((f) => ({ path: f.path, code: f.code }))));
    toast.success(`Zipped ${files.length} files`);
  };

  if (!files.length) {
    return (
      <div>
        <Head stats={stats} onZip={downloadZip} files={files} />
        <EmptyState
          icon="folder"
          title="The workspace is empty"
          action={
            <div className="row gap-8 center">
              <Button variant="primary" icon="rocket" onClick={() => onOpenTab("swarm")}>
                Run a mission
              </Button>
              <Button icon="plus" onClick={() => setNewOpen(true)}>
                New file
              </Button>
            </div>
          }
        >
          Code blocks from every agent are collected here automatically, grouped by path when the model names its files. Edit inline, then export the whole project as a ZIP.
        </EmptyState>
        <NewFileDialog open={newOpen} onClose={() => setNewOpen(false)} path={newPath} setPath={setNewPath} lang={newLang} setLang={setNewLang} onCreate={(p, l) => { addFile({ path: p, lang: l, code: "" }); setSelected(p); setNewOpen(false); setNewPath(""); }} />
      </div>
    );
  }

  return (
    <div>
      <Head stats={stats} onZip={downloadZip} files={files} onClear={() => setConfirmClear(true)} />

      {isMobile ? (
        <div className="action-bar mb-12" style={{ padding: 10 }}>
          <Select
            aria-label="Choose a file"
            className="grow"
            value={active?.path || ""}
            onChange={(e) => setSelected(e.target.value)}
            options={files.map((f) => ({ value: f.path, label: `${f.path}${f.edited ? " •" : ""}` }))}
          />
          <IconButton name="plus" label="New file" onClick={() => setNewOpen(true)} />
          <IconButton name="download" label="Download ZIP" onClick={downloadZip} />
        </div>
      ) : null}

      <div className={isMobile ? "" : "split"}>
        {!isMobile ? (
        <div className="card col" style={{ padding: 10, maxHeight: "72vh", overflow: "auto" }}>
          <div className="row gap-6 mb-8">
            <SearchInput value={query} onChange={setQuery} placeholder="Find file…" className="grow" onClear={() => setQuery("")} />
            <IconButton name="plus" label="New file" onClick={() => setNewOpen(true)} />
          </div>
          {grouped.map(([dir, group]) => (
            <div key={dir} className="mb-8">
              <div className="dimmer tiny mono" style={{ padding: "4px 8px" }}>
                {dir === "." ? "root" : `${dir}/`}
              </div>
              {group.map((f) => (
                <button key={f.path} className="tree-item" aria-current={active?.path === f.path} onClick={() => setSelected(f.path)} title={f.path}>
                  <Icon name="file" size={12} />
                  <span className="truncate grow">{f.path.split("/").pop()}</span>
                  {f.edited ? <span className="dimmer tiny" title="Edited by you">•</span> : null}
                  <span className="dimmer tiny">{f.code.split("\n").length}</span>
                </button>
              ))}
            </div>
          ))}
          {!grouped.length ? <div className="dim tiny" style={{ padding: 12 }}>No file matches “{query}”.</div> : null}
        </div>
        ) : null}

        <div className="col gap-12">
          {active ? (
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="row between gap-8 wrap" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-soft)" }}>
                <div className="row gap-8" style={{ minWidth: 0 }}>
                  <Icon name="code" size={14} />
                  {renaming === active.path ? (
                    <Input
                      autoFocus
                      defaultValue={active.path}
                      style={{ width: 260 }}
                      onBlur={(e) => {
                        if (e.target.value.trim()) renameFile(active.path, e.target.value.trim());
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <button className="strong small mono truncate" style={{ background: "none", border: 0, color: "inherit", cursor: "text" }} onClick={() => setRenaming(active.path)} title="Click to rename">
                      {active.path}
                    </button>
                  )}
                  <Badge>{active.lang}</Badge>
                  {active.agent ? <Badge tone="violet">{active.agent}</Badge> : null}
                  {active.edited ? <Badge tone="warn">edited</Badge> : null}
                </div>
                <div className="row gap-4">
                  <IconButton name="copy" label="Copy file" size={13} onClick={async () => { if (await copyText(active.code)) toast.success("File copied"); }} />
                  <IconButton name="download" label="Download file" size={13} onClick={() => downloadText(active.path.split("/").pop(), active.code)} />
                  <IconButton
                    name="trash"
                    label="Delete file"
                    size={13}
                    onClick={() => {
                      removeFile(active.path);
                      setSelected(null);
                    }}
                  />
                </div>
              </div>
              <textarea
                className="editor"
                spellCheck={false}
                value={active.code}
                onChange={(e) => updateFile(active.path, e.target.value)}
                aria-label={`${active.path} contents`}
                style={{ borderRadius: 0, border: 0, minHeight: isMobile ? 320 : 460 }}
              />
              <div className="row between" style={{ padding: "6px 12px", borderTop: "1px solid var(--border-soft)" }}>
                <span className="dimmer tiny mono">
                  {active.code.split("\n").length} lines · {active.code.length} chars
                </span>
                <span className="dimmer tiny">{isMobile ? "" : "Edits save automatically"}</span>
              </div>
            </div>
          ) : (
            <EmptyState icon="file" title="Select a file">
              {isMobile ? "Pick a file from the list above to view and edit it." : "Pick a file from the tree to view and edit it."}
            </EmptyState>
          )}
        </div>
      </div>

      <NewFileDialog open={newOpen} onClose={() => setNewOpen(false)} path={newPath} setPath={setNewPath} lang={newLang} setLang={setNewLang} onCreate={(p, l) => { addFile({ path: p, lang: l, code: "" }); setSelected(p); setNewOpen(false); setNewPath(""); }} />
      <ConfirmDialog
        open={confirmClear}
        title="Clear the workspace?"
        body="Every extracted file will be removed from this device. Agent output is untouched — you can re-extract from the Swarm tab."
        confirmLabel="Clear workspace"
        onConfirm={clearAll}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  );
}

function Head({ stats, onZip, files, onClear }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">Workspace</h1>
        <p className="page-sub">
          {stats.count} files · {stats.lines.toLocaleString()} lines · {(stats.bytes / 1024).toFixed(1)} KB{stats.edited ? ` · ${stats.edited} edited by you` : ""}
        </p>
      </div>
      <div className="row gap-8">
        <Button icon="download" onClick={onZip} disabled={!files.length}>
          Download ZIP
        </Button>
        {onClear ? (
          <Button variant="ghost" icon="trash" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function NewFileDialog({ open, onClose, path, setPath, lang, setLang, onCreate }) {
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div className="strong">New file</div>
          <IconButton name="close" label="Close" onClick={onClose} />
        </div>
        <div className="modal-body col gap-12">
          <Field label="Path">
            <Input autoFocus value={path} onChange={(e) => setPath(e.target.value)} placeholder="src/components/Button.tsx" onKeyDown={(e) => e.key === "Enter" && path.trim() && onCreate(path.trim(), lang)} />
          </Field>
          <Field label="Language">
            <Select value={lang} onChange={(e) => setLang(e.target.value)} options={LANGS} />
          </Field>
        </div>
        <div className="modal-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!path.trim()} onClick={() => onCreate(path.trim(), lang)}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
