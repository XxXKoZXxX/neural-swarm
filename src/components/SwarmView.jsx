import { useCallback, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Collapsible, Field, IconButton, Input, Modal, Progress, ScoreRing, Select, Segmented, Switch, Textarea } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import AgentCard from "./AgentCard.jsx";
import Markdown, { CodeBlock } from "./Markdown.jsx";
import { buildRunScript } from "../lib/scripts.js";
import { AGENTS, AGENT_KEYS, CONSTRAINTS, MODELS, PERSONALITIES, PLAN_TOKENS, SAMPLE_GOALS, TONES, scoreFromText } from "../lib/constants.js";
import { callModel, hasCreds } from "../lib/api.js";
import { copyText, downloadText, timeOf } from "../lib/store.js";

/**
 * The main studio: compose a goal, watch the swarm work, inspect and export
 * the delivery. Everything the other views consume (files, preview, history)
 * originates here.
 */
export default function SwarmView({
  swarm,
  settings,
  updateSettings,
  customAgents = [],
  taste,
  onFeedback,
  goal,
  setGoal,
  isGated,
  onUpgrade,
  onOpenTab,
  onSaveTemplate,
  onExport,
  planLimit = 4,
}) {
  const toast = useToast();
  const [forge, setForge] = useState({ personality: PERSONALITIES[2], tone: TONES[0], constraint: CONSTRAINTS[0], raw: "", out: "", busy: false });
  const [reviewPlan, setReviewPlan] = useState(null);
  const [planFirst, setPlanFirst] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptFormat, setScriptFormat] = useState("node");
  const goalRef = useRef(null);

  const agentNames = useMemo(() => [...AGENT_KEYS, ...customAgents.map((a) => a.name)], [customAgents]);
  const outputs = swarm.outputs;
  const delivered = Object.entries(outputs);
  const score = scoreFromText(swarm.overseer);
  const simulated = delivered.some(([, o]) => o.simulated) || swarm.plan?.simulated;

  const script = useMemo(
    () =>
      buildRunScript({
        format: scriptFormat,
        goal,
        plan: swarm.plan?.agents || Object.keys(outputs).map((name) => ({ name, instruction: "" })),
        model: settings.model,
        maxTokens: settings.maxTokens,
      }),
    [scriptFormat, goal, outputs, settings.maxTokens, settings.model, swarm.plan],
  );

  const planFirstClick = useCallback(async () => {
    if (!goal.trim()) return toast.warn("Describe your goal first.");
    if (isGated) return onUpgrade?.();
    const p = await swarm.previewPlan(goal);
    setReviewPlan(p);
    toast.info(`Plan ready: ${p.agents.map((a) => a.name).join(" → ")}`);
  }, [goal, isGated, onUpgrade, swarm, toast]);

  const start = useCallback(
    async (options = {}) => {
      if (isGated) {
        onUpgrade?.();
        return;
      }
      if (!goal.trim()) {
        toast.warn("Describe what you want built first.");
        goalRef.current?.focus();
        return;
      }
      if (reviewPlan) {
        await swarm.run(goal, { ...settings.runOptions, fixedAgents: reviewPlan.agents });
        setReviewPlan(null);
        return;
      }
      if (planFirst) {
        await planFirstClick();
        return;
      }
      await swarm.run(goal, { ...settings.runOptions, ...options });
    },
    [goal, isGated, onUpgrade, planFirst, planFirstClick, reviewPlan, settings.runOptions, swarm, toast],
  );

  const runForge = async () => {
    if (!hasCreds(settings)) return toast.warn("Prompt Forge needs a model connection — add a key in Settings, or it will run offline.");
    setForge((f) => ({ ...f, busy: true, out: "" }));
    try {
      let text = "";
      const res = await callModel({
        settings,
        system: `You are a ${forge.personality} writing in a ${forge.tone} tone. Constraint: ${forge.constraint}. Rewrite the user's rough idea into a single, precise engineering brief. Output only the brief.`,
        messages: [{ role: "user", content: forge.raw.trim() || "A production-ready product idea." }],
        maxTokens: 500,
      });
      text = res.text;
      setForge((f) => ({ ...f, out: text, busy: false }));
    } catch (e) {
      setForge((f) => ({ ...f, busy: false }));
      toast.error(e.message);
    }
  };

  const allText = delivered.map(([name, o]) => `=== ${name} ===\n${o.text}`).join("\n\n");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      {/* ── composer ───────────────────────────────────────────────────── */}
      <div className="col gap-12">
        <Card pad={false}>
          <div style={{ padding: 16 }}>
            <div className="row between mb-8">
              <span className="section-label">New mission</span>
              <span className="row gap-6">
                {taste?.enabled && taste?.likes?.length ? (
                  <Badge icon="brain" title={`${(taste.likes?.length || 0) + (taste.dislikes?.length || 0) + (taste.rules?.length || 0)} learned directives are being injected`}>
                    memory
                  </Badge>
                ) : null}
                {simulated ? <Badge tone="violet" icon="wand">offline engine</Badge> : hasCreds(settings) ? <Badge tone="accent" icon="zap">connected</Badge> : <Badge tone="warn" icon="key">no key</Badge>}
              </span>
            </div>
            <Textarea
              ref={goalRef}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") start();
              }}
              placeholder="Describe the outcome you want — e.g. “Build a multi-tenant invoicing API with Stripe billing, Postgres RLS and a test suite”."
              style={{ minHeight: 132 }}
              aria-label="Goal"
            />
            <div className="row between mt-8">
              <span className="dimmer tiny">{goal.trim().split(/\s+/).filter(Boolean).length} words</span>
              <span className="dimmer tiny">
                <span className="kbd">⌘</span> <span className="kbd">↵</span> to launch
              </span>
            </div>

            <div className="row gap-6 wrap mt-12">
              <Button variant="primary" icon="rocket" onClick={() => start()} disabled={swarm.isRunning}>
                {swarm.isRunning ? "Swarm is working…" : isGated ? "Upgrade to run" : "Launch the swarm"}
              </Button>
              {swarm.isRunning ? (
                <Button variant="danger" icon="stop" onClick={swarm.abort}>
                  Stop
                </Button>
              ) : (
                <Button icon="list" onClick={planFirstClick} disabled={!goal.trim()}>
                  Review plan first
                </Button>
              )}
              {delivered.length > 0 && !swarm.isRunning ? (
                <Button icon="plus" onClick={swarm.reset}>
                  New
                </Button>
              ) : null}
            </div>

            <div className="row gap-6 wrap mt-12">
              {SAMPLE_GOALS.map((s) => (
                <button key={s.label} className="chip" onClick={() => setGoal(s.goal)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-soft)", padding: "12px 16px" }}>
            <button className="row between" style={{ width: "100%", background: "none", border: 0, color: "inherit", cursor: "pointer" }} onClick={() => setShowAdvanced((v) => !v)}>
              <span className="section-label">Run configuration</span>
              <Icon name={showAdvanced ? "chevronDown" : "chevronRight"} size={14} />
            </button>

            {showAdvanced ? (
              <div className="col gap-12 mt-12">
                <div className="grid-2">
                  <Field label="Model">
                    <Select
                      value={settings.model}
                      onChange={(e) => updateSettings({ model: e.target.value })}
                      options={MODELS.map((m) => ({ value: m.id, label: `${m.label}${m.note ? ` · ${m.note}` : ""}` }))}
                    />
                  </Field>
                  <Field label="Max output tokens">
                    <Input
                      type="number"
                      min="200"
                      max="8000"
                      step="100"
                      value={settings.maxTokens}
                      onChange={(e) => updateSettings({ maxTokens: Number(e.target.value) || 1600 })}
                    />
                  </Field>
                </div>

                <div className="col gap-8">
                  <Switch checked={settings.runOptions?.chainMode} onChange={(v) => updateSettings({ runOptions: { ...settings.runOptions, chainMode: v } })} label="Chain mode — every agent sees the full prior output" />
                  <Switch checked={settings.runOptions?.parallel} onChange={(v) => updateSettings({ runOptions: { ...settings.runOptions, parallel: v } })} label={`Parallel mode — up to ${planLimit} agents at once`} />
                  <Switch checked={planFirst} onChange={setPlanFirst} label="Always show the plan for approval first" />
                </div>

                <Field label="Temperature" hint={`${settings.temperature.toFixed(1)} — lower is more literal, higher is more exploratory`}>
                  <input type="range" min="0" max="1" step="0.1" value={settings.temperature} onChange={(e) => updateSettings({ temperature: Number(e.target.value) })} style={{ width: "100%", accentColor: "var(--accent)" }} />
                </Field>
              </div>
            ) : (
              <div className="row gap-6 wrap mt-8">
                <Badge icon="cpu">{settings.model}</Badge>
                <Badge icon="layers">{settings.runOptions?.parallel ? "parallel" : settings.runOptions?.chainMode ? "chained" : "sequential"}</Badge>
                <Badge icon="gauge">{(settings.maxTokens || PLAN_TOKENS.free).toLocaleString()} tok/agent</Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Prompt forge */}
        <Collapsible title="Prompt Forge" icon="wand" right={<Badge>{PERSONALITIES.length * TONES.length * CONSTRAINTS.length} combos</Badge>}>
          <div className="col gap-8 mt-12">
            <Select value={forge.personality} onChange={(e) => setForge((f) => ({ ...f, personality: e.target.value }))} options={PERSONALITIES} />
            <div className="grid-2">
              <Select value={forge.tone} onChange={(e) => setForge((f) => ({ ...f, tone: e.target.value }))} options={TONES} />
              <Select value={forge.constraint} onChange={(e) => setForge((f) => ({ ...f, constraint: e.target.value }))} options={CONSTRAINTS} />
            </div>
            <Textarea rows={2} value={forge.raw} onChange={(e) => setForge((f) => ({ ...f, raw: e.target.value }))} placeholder="Rough idea to sharpen…" />
            <div className="row gap-6">
              <Button size="sm" variant="primary" icon="wand" onClick={runForge} disabled={forge.busy}>
                {forge.busy ? "Forging…" : "Forge brief"}
              </Button>
              {forge.out ? (
                <>
                  <Button size="sm" onClick={() => setGoal(forge.out)}>Use as goal</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await copyText(forge.out); toast.success("Brief copied"); }}>Copy</Button>
                </>
              ) : null}
            </div>
            {forge.out ? <div className="inset" style={{ padding: 10, fontSize: 12, maxHeight: 160, overflow: "auto" }}>{forge.out}</div> : null}
          </div>
        </Collapsible>

        {/* Plan */}
        {reviewPlan || swarm.plan ? (
          <Card
            title="Execution plan"
            subtitle={(reviewPlan || swarm.plan)?.rationale}
            actions={
              reviewPlan ? (
                <>
                  <Button size="sm" variant="primary" icon="play" onClick={() => start()}>
                    Approve & run
                  </Button>
                  <Button size="sm" variant="ghost" onClick={swarm.reset}>
                    Discard
                  </Button>
                </>
              ) : null
            }
          >
            <div className="col gap-6">
              {(reviewPlan || swarm.plan)?.agents?.map((a, i) => (
                <div key={a.name} className="row gap-10">
                  <span className="dimmer mono tiny">{i + 1}</span>
                  <span className="small strong" style={{ minWidth: 96 }}>
                    {a.name}
                  </span>
                  <span className="tiny muted grow">{a.instruction}</span>
                  {swarm.outputs[a.name] ? <Badge tone={swarm.outputs[a.name].status === "done" ? "accent" : swarm.outputs[a.name].status === "error" ? "danger" : "default"}>{swarm.outputs[a.name].status}</Badge> : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* Live rail */}
        {swarm.isRunning || delivered.length ? (
          <Card title="Swarm status" subtitle={swarm.isRunning ? "Streaming live" : "Last run"}>
            <Progress value={swarm.progress} />
            <div className="row between mt-8">
              <span className="tiny dim">{swarm.progress}%</span>
              <span className="tiny dim mono">
                ~{swarm.tokens} tok · ${swarm.cost.toFixed(5)}
              </span>
            </div>
            <div className="col gap-2 mt-12">
              {agentNames
                .filter((n) => swarm.outputs[n] || swarm.plan?.agents?.some((a) => a.name === n))
                .map((n) => {
                  const o = swarm.outputs[n];
                  const a = swarm.plan?.agents?.find((x) => x.name === n);
                  return (
                    <div key={n} className="agent-rail-row" data-status={o?.status || "queued"}>
                      <span className={`dot${o?.status === "running" ? " pulse" : ""}`} style={{ background: o?.status === "done" ? "var(--accent)" : o?.status === "running" ? "var(--accent-cyan)" : o?.status === "error" ? "var(--accent-rose)" : "var(--text-4)" }} />
                      <span className="strong tiny" style={{ width: 92 }}>
                        {n}
                      </span>
                      <span className="dimmer tiny truncate grow">{a?.instruction || ""}</span>
                      <span className="dimmer tiny mono">{o?.elapsed ? `${o.elapsed}s` : o?.status || "queued"}</span>
                    </div>
                  );
                })}
            </div>
          </Card>
        ) : null}

        {/* Log */}
        {swarm.log.length ? (
          <Collapsible title="Activity log" icon="terminal" right={<Badge>{swarm.log.length}</Badge>}>
            <div className="console mt-12" style={{ maxHeight: 220 }}>
              {swarm.log.map((l) => (
                <div className="console-line" key={l.id}>
                  <span className="dimmer">{timeOf(l.at)}</span>
                  <span style={{ color: l.level === "error" ? "var(--accent-rose)" : l.level === "warn" ? "var(--accent-amber)" : l.level === "success" ? "var(--accent)" : "var(--text-2)" }}>{l.text}</span>
                </div>
              ))}
            </div>
          </Collapsible>
        ) : null}
      </div>

      {/* ── delivery ───────────────────────────────────────────────────── */}
      <div className="col gap-12">
        {swarm.phase === "error" ? (
          <div className="card" style={{ borderColor: "var(--accent-rose)", padding: 14 }}>
            <div className="row gap-8">
              <Icon name="alert" size={16} style={{ color: "var(--accent-rose)" }} />
              <span className="strong small">Run failed</span>
            </div>
            <p className="small muted mt-8">{swarm.error}</p>
            <div className="row gap-6 mt-12">
              <Button size="sm" onClick={() => start()}>
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onOpenTab("settings")}>
                Open settings
              </Button>
            </div>
          </div>
        ) : null}

        {!delivered.length && !swarm.isRunning ? (
          <div className="card card-pad">
            <div className="row between wrap gap-12">
              <div>
                <div className="strong">Your delivery appears here</div>
                <p className="small muted mt-4" style={{ maxWidth: "62ch" }}>
                  Ten specialists are on call: architecture, research, implementation, debugging, testing, review, refactoring, analysis, docs and design. The planner picks
                  the smallest team that can finish the job.
                </p>
              </div>
              <Icon name="swarm" size={42} style={{ color: "var(--text-4)" }} />
            </div>
            <div className="auto-grid mt-16">
              {AGENT_KEYS.slice(0, 6).map((k) => (
                <div key={k} className="inset" style={{ padding: 10 }}>
                  <div className="row gap-8">
                    <span>{AGENTS[k].icon}</span>
                    <span className="tiny strong">{k}</span>
                  </div>
                  <div className="dimmer tiny mt-4">{AGENTS[k].role}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {delivered.map(([name, out]) => (
          <AgentCard
            key={name}
            name={name}
            output={out}
            instruction={swarm.plan?.agents?.find((a) => a.name === name)?.instruction}
            onRetry={(n, extra) => swarm.retryAgent(n, extra)}
            onFeedback={onFeedback}
            onInject={(text) => setGoal(`${goal}\n\n[AGENT OUTPUT TO BUILD ON]:\n${String(text).slice(0, 1500)}`)}
          />
        ))}

        {(swarm.overseer || swarm.phase === "overseeing") && (
          <Card
            title="Overseer verdict"
            subtitle="An independent score against your original goal"
            actions={
              <>
                {overseerActions(swarm, onOpenTab, onExport)}
              </>
            }
          >
            <div className="row gap-16 wrap">
              {swarm.overseer ? <ScoreRing score={score || 0} /> : null}
              <div className="grow" style={{ minWidth: 260, maxHeight: 340, overflow: "auto" }}>
                <Markdown>{swarm.overseer}</Markdown>
                {swarm.phase === "overseeing" ? <span className="caret" /> : null}
              </div>
            </div>
            {swarm.phase === "done" ? (
              <div className="row gap-6 wrap mt-16" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
                <Button size="sm" variant="primary" icon="play" onClick={() => onOpenTab("preview")}>
                  Open preview
                </Button>
                <Button size="sm" icon="folder" onClick={() => onOpenTab("files")}>
                  Extract files
                </Button>
                <Button size="sm" icon="shield" onClick={() => onOpenTab("security")}>
                  Security pass
                </Button>
                <Button size="sm" icon="history" onClick={() => onOpenTab("history")}>
                  Save to history
                </Button>
                <Button size="sm" variant="ghost" icon="scale" onClick={() => onSaveTemplate?.()}>
                  Save as template
                </Button>
                <span className="grow" />
                <Button size="sm" variant="ghost" icon="check" onClick={async () => { await copyText(allText); toast.success("All agent output copied"); }}>
                  Copy everything
                </Button>
                <Button size="sm" variant="ghost" icon="download" onClick={() => downloadText(`neural-swarm-${Date.now()}.md`, `# Neural Swarm run\n\n**Goal:** ${goal}\n\n${allText}\n\n## Overseer\n\n${swarm.overseer}\n`)}>
                  Markdown
                </Button>
                <Button size="sm" variant="ghost" icon="terminal" onClick={() => setScriptOpen(true)}>
                  Export as script
                </Button>
              </div>
            ) : null}
          </Card>
        )}

        {swarm.phase === "done" && Object.values(outputs).some((o) => o.status === "error") ? (
          <div className="row gap-8">
            <Button size="sm" variant="danger" icon="refresh" onClick={() => swarm.retryFailed()}>
              Retry failed agents
            </Button>
            <span className="tiny dim">Agents that errored can be retried individually without re-running the whole pipeline.</span>
          </div>
        ) : null}
      </div>

      <Modal
        open={scriptOpen}
        onClose={() => setScriptOpen(false)}
        title="Export this run as a script"
        subtitle="The same goal, agent order and system prompts — runnable from a terminal. Your key is read from the environment, never embedded."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setScriptOpen(false)}>
              Close
            </Button>
            <Button
              icon="copy"
              onClick={async () => {
                if (await copyText(script)) toast.success("Script copied");
              }}
            >
              Copy script
            </Button>
            <Button
              variant="primary"
              icon="download"
              onClick={() => {
                const name = scriptFormat === "python" ? "swarm-run.py" : scriptFormat === "curl" ? "swarm-run.sh" : "swarm-run.mjs";
                downloadText(name, script);
              }}
            >
              Download
            </Button>
          </>
        }
      >
        <Segmented
          value={scriptFormat}
          onChange={setScriptFormat}
          options={[
            { value: "node", label: "Node.js" },
            { value: "python", label: "Python" },
            { value: "curl", label: "cURL" },
          ]}
        />
        <div className="mt-12">
          <CodeBlock code={script} lang={scriptFormat === "python" ? "python" : scriptFormat === "curl" ? "bash" : "javascript"} path={scriptFormat === "python" ? "swarm-run.py" : scriptFormat === "curl" ? "swarm-run.sh" : "swarm-run.mjs"} maxHeight={420} />
        </div>
      </Modal>
    </div>
  );
}

function overseerActions(swarm, onOpenTab, onExport) {
  return (
    <>
      {onExport ? (
        <Button size="sm" variant="ghost" icon="upload" onClick={() => onExport("gist")}>
          Share
        </Button>
      ) : null}
      {onExport ? (
        <Button size="sm" variant="ghost" icon="send" onClick={() => onExport("webhook")}>
          Webhook
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" icon="chart" onClick={() => onOpenTab("insights")}>
        Insights
      </Button>
    </>
  );
}
