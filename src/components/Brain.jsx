import { useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Input, Progress, Switch } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import { formatTastePrompt } from "../lib/constants.js";
import { downloadText } from "../lib/store.js";

const xpForLevel = (level) => level * 100;

/** Team memory: what the swarm has learned about how you like work done. */
export default function Brain({ memory, setMemory, runCount = 0 }) {
  const toast = useToast();
  const [draft, setDraft] = useState({ kind: "likes", value: "" });
  const [confirmReset, setConfirmReset] = useState(false);

  const level = memory.level || 1;
  const xp = memory.xp || 0;
  const intoLevel = xp - (level - 1) * 100;
  const pct = Math.max(4, Math.min(100, (intoLevel / xpForLevel(level)) * 100));

  const prompt = useMemo(() => formatTastePrompt(memory).trim() || "Memory is off or empty — agents run with their base brief.", [memory]);

  const add = () => {
    const value = draft.value.trim();
    if (!value) return;
    setMemory((m) => ({ ...m, [draft.kind]: [...new Set([...(m[draft.kind] || []), value])] }));
    setDraft((d) => ({ ...d, value: "" }));
  };

  const remove = (kind, value) => setMemory((m) => ({ ...m, [kind]: (m[kind] || []).filter((v) => v !== value) }));

  const lists = [
    { kind: "likes", title: "Preferred patterns", icon: "check", tone: "accent" },
    { kind: "dislikes", title: "Anti-patterns to avoid", icon: "close", tone: "danger" },
    { kind: "rules", title: "Standing directives", icon: "shield", tone: "violet" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Team memory</h1>
          <p className="page-sub">
            Every 👍 / 👎 and every run tunes a profile that is injected into each agent's brief. Level {level} · {xp} XP · {runCount} runs observed.
          </p>
        </div>
        <div className="row gap-8">
          <Switch checked={memory.enabled} onChange={(v) => setMemory((m) => ({ ...m, enabled: v }))} label="Inject memory into runs" />
          <Button icon="download" variant="ghost" onClick={() => downloadText("neural-swarm-memory.json", JSON.stringify(memory, null, 2), "application/json")}>
            Export
          </Button>
          <Button icon="trash" variant="ghost" onClick={() => setConfirmReset(true)}>
            Reset
          </Button>
        </div>
      </div>

      <div className="grid-3 mb-16">
        <Card>
          <div className="section-label">Progress</div>
          <div className="row between mt-8">
            <span className="stat-value" style={{ fontSize: 20 }}>
              Level {level}
            </span>
            <Badge tone="accent">{xp} XP</Badge>
          </div>
          <Progress value={pct} />
          <div className="dimmer tiny mt-8">{Math.max(0, xpForLevel(level) - intoLevel)} XP to level {level + 1} — feedback and finished runs both feed it.</div>
        </Card>
        <Card>
          <div className="section-label">Learned directives</div>
          <div className="row gap-8 wrap mt-8">
            <Badge tone="accent">{memory.likes?.length || 0} preferred</Badge>
            <Badge tone="danger">{memory.dislikes?.length || 0} avoided</Badge>
            <Badge tone="violet">{memory.rules?.length || 0} rules</Badge>
          </div>
          <div className="dimmer tiny mt-8">Memory is stored locally and only ever leaves your machine inside the prompt you send to your own model key.</div>
        </Card>
        <Card>
          <div className="section-label">What agents receive</div>
          <pre className="mono tiny muted mt-8" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>
            {prompt}
          </pre>
        </Card>
      </div>

      <div className="grid-3">
        {lists.map((list) => (
          <Card key={list.kind} title={list.title} subtitle={`${(memory[list.kind] || []).length} entries`}>
            <div className="col gap-6" style={{ maxHeight: 260, overflow: "auto" }}>
              {(memory[list.kind] || []).length === 0 ? (
                <span className="dimmer tiny">Nothing recorded yet.</span>
              ) : (
                (memory[list.kind] || []).map((value) => (
                  <div key={value} className="row between gap-8 inset" style={{ padding: "6px 8px" }}>
                    <span className="row gap-6" style={{ minWidth: 0 }}>
                      <Icon name={list.icon} size={12} style={{ color: `var(--accent${list.tone === "accent" ? "" : `-${list.tone}`})` }} />
                      <span className="tiny truncate">{value}</span>
                    </span>
                    <IconButton name="close" label="Remove" size={11} onClick={() => remove(list.kind, value)} />
                  </div>
                ))
              )}
            </div>
            <Field className="mt-12">
              <div className="row gap-6">
                <Input
                  value={draft.kind === list.kind ? draft.value : ""}
                  placeholder="Add a preference…"
                  onChange={(e) => setDraft({ kind: list.kind, value: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && draft.kind === list.kind && add()}
                />
                <Button icon="plus" onClick={() => draft.kind === list.kind && add()} disabled={draft.kind !== list.kind || !draft.value.trim()}>
                  Add
                </Button>
              </div>
            </Field>
          </Card>
        ))}
      </div>

      <Card title="Memory log" subtitle="Most recent events first" className="mt-16">
        {(memory.log || []).length === 0 ? (
          <EmptyState icon="brain" title="No memory events yet">
            Rate agent output with 👍 / 👎 on any run and the note appears here.
          </EmptyState>
        ) : (
          <div className="col gap-4" style={{ maxHeight: 260, overflow: "auto" }}>
            {(memory.log || []).map((line, i) => (
              <div key={i} className="row gap-8">
                <Icon name="brain" size={12} style={{ color: "var(--text-4)" }} />
                <span className="tiny muted mono">{line}</span>
              </div>
            ))}
          </div>
        )}
        <div className="row gap-8 mt-12">
          <Button
            size="sm"
            icon="sparkles"
            onClick={() => {
              setMemory((m) => ({ ...m, xp: (m.xp || 0) + 10, log: [`[${new Date().toLocaleTimeString()}] Manual reinforcement (+10 XP)`, ...(m.log || [])].slice(0, 40) }));
              toast.success("Memory reinforced");
            }}
          >
            Reinforce now
          </Button>
          <span className="dimmer tiny">Useful when a run went well but you forgot to rate it.</span>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="Reset team memory?"
        body="Learned preferences, directives and XP are cleared. Vault items and run history are untouched."
        confirmLabel="Reset memory"
        onConfirm={() => setMemory({ enabled: true, level: 1, xp: 0, likes: [], dislikes: [], rules: [], log: [] })}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
