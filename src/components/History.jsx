import { useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, SearchInput, Select } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import Markdown from "./Markdown.jsx";
import { diffTokens } from "../lib/api.js";
import { fmtWhen, getAgent } from "../lib/constants.js";
import { copyText, downloadText } from "../lib/store.js";

/**
 * Run history: browse, search, compare two runs word-by-word, restore, branch
 * or delete. Works against Supabase when configured and local runs otherwise.
 */
export default function History({ runs, loading, onRefresh, sbReady, onRestore, onBranch, onDelete, onToggleStar, onOpenTab }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("all");
  const [viewRun, setViewRun] = useState(null);
  const [pick, setPick] = useState([]);
  const [diffing, setDiffing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const branches = useMemo(() => ["all", ...new Set(["main", ...runs.map((r) => r.branch || "main")])], [runs]);
  const filtered = useMemo(
    () => runs.filter((r) => (branch === "all" || (r.branch || "main") === branch) && (!query || (r.goal || "").toLowerCase().includes(query.toLowerCase()))),
    [runs, branch, query],
  );

  const togglePick = (run) => {
    setPick((prev) => (prev.some((p) => p.id === run.id) ? prev.filter((p) => p.id !== run.id) : [...prev, run].slice(-2)));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">
            {runs.length} recorded run{runs.length === 1 ? "" : "s"} {sbReady ? "· synced with Supabase" : "· stored on this device only"}
          </p>
        </div>
        <div className="row gap-8">
          <Button icon="refresh" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button
            variant={pick.length ? "primary" : "default"}
            icon="scale"
            disabled={pick.length !== 2}
            onClick={() => setDiffing((d) => !d)}
          >
            {pick.length === 2 ? (diffing ? "Hide diff" : "Compare 2 runs") : `Select 2 to compare (${pick.length})`}
          </Button>
        </div>
      </div>

      <div className="toolbar mb-12">
        <SearchInput value={query} onChange={setQuery} placeholder="Search goals…" className="grow" onClear={() => setQuery("")} />
        <Select value={branch} onChange={(e) => setBranch(e.target.value)} options={branches.map((b) => ({ value: b, label: b === "all" ? "All branches" : `⎇ ${b}` }))} style={{ width: 190 }} />
        {pick.length ? (
          <Button size="sm" variant="ghost" icon="close" onClick={() => setPick([])}>
            Clear selection
          </Button>
        ) : null}
      </div>

      {diffing && pick.length === 2 ? <DiffView a={pick[0]} b={pick[1]} onClose={() => setDiffing(false)} /> : null}

      {viewRun ? (
        <div>
          <Button variant="ghost" icon="chevronLeft" className="mb-12" onClick={() => setViewRun(null)}>
            Back to list
          </Button>
          <Card
            title={(viewRun.goal || "").slice(0, 90)}
            subtitle={`⎇ ${viewRun.branch || "main"} · v${viewRun.version_num || "?"} · ${fmtWhen(viewRun.created_at)}`}
            actions={
              <>
                <Button size="sm" icon="edit" onClick={() => onRestore(viewRun)}>
                  Restore to studio
                </Button>
                <Button size="sm" variant="ghost" icon="download" onClick={() => downloadText(`run-${viewRun.id}.md`, runToMarkdown(viewRun))}>
                  Export
                </Button>
                <Button size="sm" variant="ghost" icon="copy" onClick={async () => { await copyText(runToMarkdown(viewRun)); toast.success("Run copied"); }}>
                  Copy
                </Button>
              </>
            }
          >
            <div className="row gap-8 wrap mb-12">
              {viewRun.score ? <Badge tone="accent">★ {viewRun.score}</Badge> : null}
              {viewRun.tokens_used ? <Badge>{viewRun.tokens_used} tokens</Badge> : null}
              {viewRun.cost ? <Badge tone="warn">${Number(viewRun.cost).toFixed(5)}</Badge> : null}
              <Badge>{Object.keys(viewRun.agents || {}).length} agents</Badge>
            </div>
            <div className="col gap-12">
              {Object.entries(viewRun.agents || {}).map(([name, out]) => (
                <div key={name} className="inset" style={{ padding: 12 }}>
                  <div className="row between mb-8">
                    <span className="row gap-8">
                      <span style={{ color: getAgent(name).color }}>{getAgent(name).icon}</span>
                      <span className="strong small">{name}</span>
                    </span>
                    <Badge>{out.status || "done"}</Badge>
                  </div>
                  <div style={{ maxHeight: 320, overflow: "auto" }}>
                    <Markdown>{out.text || ""}</Markdown>
                  </div>
                </div>
              ))}
              {viewRun.overseer ? (
                <div className="inset" style={{ padding: 12 }}>
                  <div className="section-label mb-8">Overseer</div>
                  <Markdown>{viewRun.overseer}</Markdown>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="history" title={runs.length ? "No run matches that filter" : "No runs recorded yet"} action={<Button variant="primary" icon="rocket" onClick={() => onOpenTab("swarm")}>Start a run</Button>}>
          {sbReady
            ? "Every finished run is saved with its goal, agents, outputs, score, tokens and cost."
            : "Add your Supabase URL and anon key in Settings to sync runs across devices — until then history lives in this browser."}
        </EmptyState>
      ) : (
        <div className="col gap-8">
          {filtered.map((run) => {
            const selected = pick.some((p) => p.id === run.id);
            return (
              <div key={run.id} className="card row between gap-12" style={{ padding: "12px 14px", borderColor: selected ? "var(--accent)" : "var(--border)" }}>
                <div className="row gap-10 grow" style={{ minWidth: 0 }}>
                  <button className="btn btn-icon btn-ghost" onClick={() => togglePick(run)} aria-label="Select for comparison" style={{ color: selected ? "var(--accent)" : undefined }}>
                    {selected ? <span className="mono tiny">{pick.findIndex((p) => p.id === run.id) + 1}</span> : <span className="dot" style={{ background: "var(--border-strong)" }} />}
                  </button>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="small strong truncate">{(run.goal || "Untitled run").slice(0, 110)}</span>
                    <span className="row gap-8 wrap mt-4">
                      <span className="dimmer tiny mono">⎇ {run.branch || "main"}</span>
                      <span className="dimmer tiny mono">v{run.version_num || "?"}</span>
                      {run.score ? <Badge tone="accent">★ {run.score}</Badge> : null}
                      {run.tokens_used ? <Badge>{run.tokens_used} tok</Badge> : null}
                      {run.cost ? <Badge tone="warn">${Number(run.cost).toFixed(4)}</Badge> : null}
                      <span className="dimmer tiny">{fmtWhen(run.created_at)}</span>
                      {run.starred ? <Badge tone="warn">★ starred</Badge> : null}
                    </span>
                  </div>
                </div>
                <div className="row gap-4">
                  <IconButton name="eye" label="View run" size={14} onClick={() => setViewRun(run)} />
                  <IconButton name="star" label="Star this run" size={14} onClick={() => onToggleStar(run)} />
                  <IconButton name="gitBranch" label="Branch from this run" size={14} onClick={() => onBranch(run)} />
                  <IconButton name="edit" label="Restore into the studio" size={14} onClick={() => onRestore(run)} />
                  <IconButton name="trash" label="Delete" size={14} onClick={() => setConfirmDelete(run)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this run?"
        body="The run record is removed from history. Agent output already exported or copied is unaffected."
        confirmLabel="Delete run"
        onConfirm={() => onDelete(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function DiffView({ a, b, onClose }) {
  const names = useMemo(() => [...new Set([...Object.keys(a.agents || {}), ...Object.keys(b.agents || {})])], [a, b]);
  return (
    <Card
      title={`Comparing v${a.version_num || "?"} with v${b.version_num || "?"}`}
      subtitle="Added words are highlighted on the right, removed words on the left"
      className="mb-12"
      actions={<Button size="sm" variant="ghost" icon="close" onClick={onClose}>Close</Button>}
    >
      <div className="col gap-12">
        {names.map((name) => {
          const left = a.agents?.[name]?.text || "";
          const right = b.agents?.[name]?.text || "";
          const { left: l, right: r, changed, similarity } = diffTokens(left, right);
          if (!changed) {
            return (
              <div key={name} className="row between inset" style={{ padding: "8px 10px" }}>
                <span className="small strong">
                  {getAgent(name).icon} {name}
                </span>
                <Badge>identical</Badge>
              </div>
            );
          }
          return (
            <div key={name}>
              <div className="row between mb-8">
                <span className="small strong">
                  {getAgent(name).icon} {name}
                </span>
                <Badge tone="warn">
                  {changed} changed tokens · {similarity}% similar
                </Badge>
              </div>
              <div className="diff-grid">
                <div>
                  <div className="diff-head">A · v{a.version_num || "?"}</div>
                  <div className="diff-col">
                    {l.map((t, i) => (t.type === "del" ? <span className="del" key={i}>{t.t}</span> : <span key={i}>{t.t}</span>))}
                  </div>
                </div>
                <div>
                  <div className="diff-head">B · v{b.version_num || "?"}</div>
                  <div className="diff-col">
                    {r.map((t, i) => (t.type === "ins" ? <span className="ins" key={i}>{t.t}</span> : <span key={i}>{t.t}</span>))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const runToMarkdown = (run) =>
  [
    `# Neural Swarm run`,
    ``,
    `**Goal:** ${run.goal || ""}`,
    `**Branch:** ${run.branch || "main"} · **Version:** ${run.version_num || "?"} · **Score:** ${run.score || "—"}`,
    `**Recorded:** ${run.created_at || ""}`,
    ``,
    ...Object.entries(run.agents || {}).map(([name, out]) => `## ${name}\n\n${out.text || ""}\n`),
    run.overseer ? `## Overseer\n\n${run.overseer}` : "",
  ].join("\n");
