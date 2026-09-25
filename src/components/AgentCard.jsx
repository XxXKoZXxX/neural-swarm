import { useState } from "react";
import { Badge, Button, Dot, IconButton, StatusPill } from "./ui.jsx";
import { Icon } from "./icons.jsx";
import Markdown from "./Markdown.jsx";
import { downloadText, copyText } from "../lib/store.js";
import { getAgent } from "../lib/constants.js";

/**
 * One agent's deliverable: streamed markdown, live caret, per-agent actions
 * (copy / download / retry / regenerate with a note) and taste feedback.
 */
export default function AgentCard({ name, output = {}, agentDef, instruction, onRetry, onFeedback, onInject, compact = false }) {
  const agent = getAgent(name, agentDef ? {} : undefined) || getAgent(name);
  const def = agentDef || agent;
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [rated, setRated] = useState(null);
  const status = output.status || "idle";
  const text = output.text || "";

  const rate = (kind) => {
    setRated(kind);
    onFeedback?.(name, kind, text);
  };

  return (
    <article className="card" data-agent={name} style={{ marginBottom: 10, borderColor: status === "running" ? "var(--accent-line)" : status === "error" ? "color-mix(in srgb, var(--accent-rose) 40%, transparent)" : "var(--border)" }}>
      <header className="row between gap-10" style={{ padding: "10px 12px" }}>
        <button className="row gap-10 grow" style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left", color: "inherit", minWidth: 0 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span
            style={{
              width: 30, height: 30, borderRadius: 8, flex: "none", display: "grid", placeItems: "center",
              background: `color-mix(in srgb, ${def.color} 16%, transparent)`, color: def.color, border: `1px solid color-mix(in srgb, ${def.color} 32%, transparent)`, fontSize: 14,
            }}
          >
            {def.icon}
          </span>
          <span className="col" style={{ minWidth: 0 }}>
            <span className="row gap-6">
              <span className="strong small">{name}</span>
              {output.simulated ? (
                <Badge tone="violet" title="Produced by the offline simulation engine">
                  simulated
                </Badge>
              ) : null}
            </span>
            <span className="dimmer tiny truncate" style={{ maxWidth: "54ch" }}>
              {def.role}
              {instruction ? ` · ${instruction}` : ""}
            </span>
          </span>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        </button>
        <div className="row gap-6 wrap" style={{ justifyContent: "flex-end" }}>
          {output.elapsed ? <span className="dimmer tiny mono">{output.elapsed}s</span> : null}
          {output.tokens ? <span className="dimmer tiny mono">~{output.tokens} tok</span> : null}
          <StatusPill status={status} />
          {text && status !== "running" ? (
            <>
              <IconButton name="copy" label="Copy output" size={13} onClick={async () => copyText(text)} />
              <IconButton name="download" label="Download as markdown" size={13} onClick={() => downloadText(`${name.toLowerCase()}.md`, `# ${name}\n\n${text}\n`)} />
              {onInject ? <IconButton name="send" label="Send to goal" size={13} onClick={() => onInject(text)} /> : null}
              {onRetry ? <IconButton name="refresh" label={showNote ? "Hide re-run options" : "Re-run this agent"} size={13} onClick={() => setShowNote((s) => !s)} /> : null}
            </>
          ) : null}
          {status === "error" && onRetry ? <Button size="sm" variant="danger" onClick={() => onRetry(name)}>Retry</Button> : null}
        </div>
      </header>

      {showNote && onRetry ? (
        <div className="row gap-8" style={{ padding: "0 12px 10px" }}>
          <input className="input" placeholder="Optional instruction for the re-run, e.g. “use Postgres not SQLite”" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onRetry(name, note);
              setShowNote(false);
              setNote("");
            }}
          >
            Re-run
          </Button>
        </div>
      ) : null}

      {open ? (
        <div style={{ padding: "0 12px 12px" }}>
          {text ? (
            <div style={{ background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-sm)", padding: "12px 14px", maxHeight: compact ? 260 : 460, overflow: "auto" }}>
              <Markdown>{text}</Markdown>
              {status === "running" ? <span className="caret" /> : null}
            </div>
          ) : (
            <div className="row gap-8 dim tiny" style={{ padding: "10px 2px" }}>
              <Dot status={status} pulse />
              {status === "running" ? "Waiting for the first tokens…" : "No output."}
            </div>
          )}
          {status !== "running" && text && onFeedback ? (
            <div className="row gap-6 mt-8">
              <span className="dimmer tiny">Was this useful?</span>
              <button className="btn btn-sm btn-ghost" aria-pressed={rated === "like"} style={{ color: rated === "like" ? "var(--accent)" : undefined }} onClick={() => rate("like")} title="Reinforce this style">
                👍 <span className="dimmer">helps memory</span>
              </button>
              <button className="btn btn-sm btn-ghost" aria-pressed={rated === "dislike"} style={{ color: rated === "dislike" ? "var(--accent-amber)" : undefined }} onClick={() => rate("dislike")} title="Record an anti-pattern">
                👎 <span className="dimmer">flag problem</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
