import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, Field, Segmented, Select, Textarea } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import Markdown from "./Markdown.jsx";
import { extractCodeFiles, hasCreds, streamModel } from "../lib/api.js";
import { timeOf } from "../lib/store.js";

const QUICK = [
  { cmd: "/heal", hint: "Diagnose the delivery and patch the weakest file" },
  { cmd: "/test", hint: "Write regression tests for the current workspace" },
  { cmd: "/explain", hint: "Explain what the swarm actually built" },
  { cmd: "/review", hint: "Severity-rated review of the current files" },
];

/**
 * Autonomous terminal (Devin/Warp style): the live run log plus a command
 * surface that can diagnose failures and apply generated patches straight
 * into the workspace.
 */
export default function Terminal({ swarm, settings, workspace, goal, onOpenTab }) {
  const toast = useToast();
  const [mode, setMode] = useState("log");
  const [input, setInput] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(workspace.files[0]?.path || "");
  const [healOutput, setHealOutput] = useState("");
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [swarm.log.length, transcript.length]);

  const filesForPrompt = useMemo(
    () =>
      workspace.files
        .slice(0, 6)
        .map((f) => `--- ${f.path} ---\n${String(f.code).slice(0, 2600)}`)
        .join("\n\n"),
    [workspace.files],
  );

  const runCommand = async (raw) => {
    const text = String(raw || "").trim();
    if (!text) return;
    setTranscript((t) => [...t, { id: Math.random().toString(36).slice(2), kind: "in", text, at: new Date() }]);
    setInput("");
    setBusy(true);
    setHealOutput("");

    const isHeal = /^\/heal/i.test(text);
    const intent = isHeal ? "heal" : /^\/test/i.test(text) ? "test" : /^\/explain/i.test(text) ? "explain" : /^\/review/i.test(text) ? "review" : "custom";
    const extra = text.replace(/^\/\w+\s*/, "");

    const prompts = {
      heal: "You are the DEBUGGER. Diagnose the most likely defect in this generated project, explain the root cause in two sentences, then output the corrected file in a single fenced code block whose info string is the file path.",
      test: "You are the TESTER. Write a regression suite for this project. Output one fenced code block per test file with the path as the info string.",
      explain: "You are the WRITER. Explain what was built: modules, data flow, and how to run it. Be concise.",
      review: "You are the REVIEWER. Review the files and rate each issue CRITICAL/MAJOR/MINOR/NIT with a one-line fix.",
      custom: "You are the DEBUGGER operating an autonomous terminal. Answer the request precisely. If code changes are needed, output the full corrected file in a fenced block whose info string is the path.",
    };

    try {
      if (!hasCreds(settings) && intent !== "custom") throw new Error("Connect a model in Settings to run terminal commands (offline mode is read-only).");
      let out = "";
      const res = await streamModel({
        settings,
        system: prompts[intent],
        messages: [
          {
            role: "user",
            content: `GOAL: ${goal || "(no goal set)"}\n${target ? `PATCH TARGET: ${target}\n` : ""}\nCURRENT FILES:\n${filesForPrompt || "(workspace is empty)"}\n\nREQUEST: ${extra || text}`,
          },
        ],
        maxTokens: Math.min(settings.maxTokens || 1600, 2200),
        onToken: (chunk) => {
          out += chunk;
          setHealOutput((prev) => prev + chunk);
        },
      });
      out = res.text || out;
      setTranscript((t) => [...t, { id: Math.random().toString(36).slice(2), kind: "out", text: out, at: new Date(), simulated: res.simulated }]);
    } catch (err) {
      setTranscript((t) => [...t, { id: Math.random().toString(36).slice(2), kind: "err", text: err.message, at: new Date() }]);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const lastOut = [...transcript].reverse().find((t) => t.kind === "out");
  const patchable = lastOut ? extractCodeFiles(lastOut.text, { agentName: "patch" }) : [];

  const applyPatch = (file) => {
    const existing = workspace.files.find((f) => f.path === file.path);
    if (existing) workspace.updateFile(file.path, file.code);
    else workspace.addFile({ ...file, path: file.path, code: file.code });
    toast.success(`${existing ? "Patched" : "Created"} ${file.path}`);
    onOpenTab("files");
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Terminal</h1>
          <p className="page-sub">
            Live run log and an autonomous command surface. <span className="mono">/heal</span> diagnoses the delivery and writes the fix into the workspace.
          </p>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: "log", label: "Run log", icon: "terminal" }, { value: "console", label: "Auto-heal", icon: "wand" }]} />
      </div>

      {mode === "log" ? (
        swarm.log.length ? (
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="row between" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-soft)" }}>
              <span className="row gap-8">
                <Icon name="activity" size={14} />
                <span className="small strong">Engine log</span>
                <Badge>{swarm.log.length} lines</Badge>
              </span>
              <span className="dimmer tiny mono">~{swarm.tokens} tok · ${swarm.cost.toFixed(5)}</span>
            </div>
            <div className="console" style={{ border: 0, borderRadius: 0, maxHeight: "68vh", minHeight: 320 }} ref={scroller}>
              {swarm.log.map((l) => (
                <div className="console-line" key={l.id}>
                  <span className="dimmer">{timeOf(l.at)}</span>
                  <span style={{ width: 96, flex: "none", color: "var(--accent)" }} className="truncate">
                    {l.agent}
                  </span>
                  <span style={{ color: l.level === "error" ? "var(--accent-rose)" : l.level === "warn" ? "var(--accent-amber)" : l.level === "success" ? "var(--accent)" : "var(--text-2)" }}>{l.text}</span>
                </div>
              ))}
              {swarm.isRunning ? <span className="caret" /> : null}
            </div>
          </div>
        ) : (
          <EmptyState icon="terminal" title="No engine activity yet" action={<Button variant="primary" icon="rocket" onClick={() => onOpenTab("swarm")}>Start a run</Button>}>
            Every planner decision, agent start, token count and failure lands here in real time — useful for debugging a run that misbehaves.
          </EmptyState>
        )
      ) : (
        <div className="split">
          <div className="card card-pad col gap-12">
            <div className="section-label">Commands</div>
            {QUICK.map((q) => (
              <button key={q.cmd} className="chip" style={{ justifyContent: "flex-start" }} onClick={() => runCommand(q.cmd)} disabled={busy}>
                <span className="mono">{q.cmd}</span>
                <span className="dimmer tiny">{q.hint}</span>
              </button>
            ))}
            <Field label="Patch target">
              <Select value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: "", label: "Ask the model for a path" }, ...workspace.files.map((f) => ({ value: f.path, label: f.path }))]} />
            </Field>
            <div className="hint">
              Patches are written into the file whose path the model puts in the code fence. Anything else lands as a new file.
            </div>
          </div>

          <div className="col gap-12">
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="console" style={{ border: 0, borderRadius: 0, minHeight: 300, maxHeight: "54vh" }} ref={scroller}>
                {transcript.length === 0 ? (
                  <span className="dimmer">No commands yet. Try /heal — the swarm will audit its own delivery and hand back a patch.</span>
                ) : (
                  transcript.map((t) => (
                    <div key={t.id} style={{ marginBottom: 8 }}>
                      <div className="console-line">
                        <span className="dimmer">{timeOf(t.at)}</span>
                        <span style={{ color: t.kind === "err" ? "var(--accent-rose)" : t.kind === "in" ? "var(--accent-cyan)" : "var(--text-3)" }}>{t.kind === "in" ? "❯" : t.kind === "err" ? "✗" : "•"}</span>
                        <span className="grow">{t.text}</span>
                      </div>
                    </div>
                  ))
                )}
                {busy && healOutput ? (
                  <div style={{ marginTop: 6 }}>
                    <Markdown>{healOutput}</Markdown>
                    <span className="caret" />
                  </div>
                ) : null}
              </div>
              <div className="row gap-8 term-bar" style={{ padding: 10, borderTop: "1px solid var(--border-soft)" }}>
                <input
                  className="input input-mono"
                  placeholder="❯ /heal, /test, /review or any instruction…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && runCommand(input)}
                  aria-label="Terminal command"
                />
                <Button variant="primary" icon="send" onClick={() => runCommand(input)} disabled={busy || !input.trim()}>
                  {busy ? "Working" : "Run"}
                </Button>
              </div>
            </div>

            {patchable.length ? (
              <div className="card card-pad">
                <div className="row between mb-8">
                  <span className="section-label">Proposed patches</span>
                  <Badge tone="accent">{patchable.length}</Badge>
                </div>
                <div className="col gap-8">
                  {patchable.map((f) => (
                    <div key={f.path} className="row between gap-8 inset" style={{ padding: "8px 10px" }}>
                      <span className="mono tiny truncate">{f.path}</span>
                      <span className="row gap-6">
                        <span className="dimmer tiny">{f.code.split("\n").length} lines</span>
                        <Button size="sm" variant="primary" icon="check" onClick={() => applyPatch(f)}>
                          Apply
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
