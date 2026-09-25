import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Segmented, Textarea } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import Markdown from "./Markdown.jsx";
import { SEVERITIES, parseFindings } from "../lib/api.js";
import { hasCreds, streamModel } from "../lib/api.js";
import { copyText, downloadText } from "../lib/store.js";
import { slugify } from "../lib/constants.js";

const STAGES = [
  {
    id: "RESEARCHER",
    label: "Recon",
    system:
      "You are a security researcher. Map the attack surface: entry points, trust boundaries, secrets handling, dependency risk and the three most plausible exploit paths. Be specific about files and functions. No filler.",
  },
  {
    id: "DEBUGGER",
    label: "Exploit trace",
    system:
      "You are an exploitation engineer. For each plausible vulnerability, show the concrete path from user input to impact, then give a minimal patch diff. Rate each finding as [CRITICAL], [MAJOR], [MINOR] or [NIT] at the start of its line with the location and a one-line fix.",
  },
  {
    id: "REVIEWER",
    label: "Verdict",
    system:
      "You are a principal security reviewer. Judge the previous findings: which are real, which are false positives, what was missed, and what must block release. Use [CRITICAL]/[MAJOR]/[MINOR]/[NIT] prefixes for every finding line.",
  },
];

/** Bug-bounty style three-stage audit desk. */
export default function SecurityDesk({ settings, onSaveVault, setGoal, onOpenTab, isGated, onUpgrade }) {
  const toast = useToast();
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState("repo");
  const [stageState, setStageState] = useState({});
  const [busy, setBusy] = useState(false);
  const [issueRepo, setIssueRepo] = useState("");
  const abortRef = useRef(null);

  const findings = useMemo(() => {
    const all = [];
    for (const s of STAGES) all.push(...parseFindings(stageState[s.id]?.text || ""));
    const bySeverity = Object.fromEntries(SEVERITIES.map((sev) => [sev, all.filter((f) => f.severity === sev)]));
    const risk = bySeverity.CRITICAL.length * 10 + bySeverity.MAJOR.length * 4 + bySeverity.MINOR.length;
    return { all, bySeverity, risk };
  }, [stageState]);

  const runStage = async (stage, context) => {
    setStageState((prev) => ({ ...prev, [stage.id]: { text: "", status: "running" } }));
    let text = "";
    const res = await streamModel({
      settings,
      system: stage.system,
      messages: [
        {
          role: "user",
          content: `${mode === "repo" ? "TARGET REPOSITORY" : "TARGET CODE"}: ${target.slice(0, 12000)}\n\n${
            context ? `PRIOR STAGE OUTPUT:\n${context.slice(0, 8000)}` : "This is the first stage — start from the raw target."
          }`,
        },
      ],
      signal: abortRef.current?.signal,
      maxTokens: Math.min(settings.maxTokens || 1600, 2000),
      onToken: (chunk) => {
        text += chunk;
        setStageState((prev) => ({ ...prev, [stage.id]: { text: (prev[stage.id]?.text || "") + chunk, status: "running" } }));
      },
    });
    const final = res.text || text;
    setStageState((prev) => ({ ...prev, [stage.id]: { text: final, status: "done", simulated: res.simulated } }));
    return final;
  };

  const audit = async () => {
    if (isGated) return onUpgrade?.();
    if (!target.trim()) return toast.warn("Paste a repository URL, a file path or some code to audit.");
    if (!hasCreds(settings)) return toast.warn("The audit desk needs a model connection — add a key in Settings.");
    setBusy(true);
    setStageState({});
    abortRef.current = new AbortController();
    try {
      let context = "";
      for (const stage of STAGES) {
        context = await runStage(stage, context);
      }
      toast.success("Audit complete");
    } catch (err) {
      if (err.name !== "AbortError") toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const patchDraft = () => {
    const body = [
      "# Security audit",
      "",
      `**Target:** ${target.slice(0, 200)}`,
      "",
      `**Findings:** ${findings.all.length} (${SEVERITIES.map((s) => `${findings.bySeverity[s].length} ${s}`).join(", ")})`,
      "",
      ...STAGES.map((s) => `## ${s.label}\n\n${stageState[s.id]?.text || "_not run_"}\n`),
    ].join("\n");
    return body;
  };

  const openIssue = () => {
    const repo = issueRepo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast.warn("Enter the issue repo as owner/name.");
    const title = encodeURIComponent(`Security audit: ${findings.all.length} findings (${findings.bySeverity.CRITICAL.length} critical)`);
    const body = encodeURIComponent(patchDraft().slice(0, 7000));
    window.open(`https://github.com/${repo}/issues/new?title=${title}&body=${body}&labels=security`, "_blank", "noopener");
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Security desk</h1>
          <p className="page-sub">A three-stage pipeline — recon, exploit trace, verdict — rated CRITICAL/MAJOR/MINOR/NIT and exportable as a GitHub issue.</p>
        </div>
        <div className="row gap-8">
          <Segmented value={mode} onChange={setMode} options={[{ value: "repo", label: "Repo / path", icon: "gitBranch" }, { value: "code", label: "Paste code", icon: "code" }]} />
          <Button variant="primary" icon="shield" onClick={audit} disabled={busy}>
            {busy ? "Auditing…" : "Run audit"}
          </Button>
          {busy ? (
            <Button variant="danger" icon="stop" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid-2 mb-12" style={{ alignItems: "start" }}>
        <Card title="Target" subtitle={mode === "repo" ? "Public or private repo, or a path in your tree" : "Paste the code to inspect"}>
          <Textarea
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={mode === "repo" ? "github.com/acme/api   ·   src/routes/auth.ts" : "Paste code here…"}
            style={{ minHeight: 180 }}
            aria-label="Audit target"
          />
          <div className="hint mt-8">
            Nothing is uploaded anywhere except to your configured model endpoint. Keys stay in this browser unless you route through the Supabase proxy.
          </div>
        </Card>

        <Card title="Risk summary" subtitle="Findings detected across every stage">
          {findings.all.length === 0 ? (
            <div className="dim small">No findings parsed yet. Severity labels like <span className="mono">[CRITICAL]</span> are counted automatically.</div>
          ) : (
            <>
              <div className="row gap-12 wrap">
                {SEVERITIES.map((sev) => (
                  <div key={sev} className="col">
                    <span className="section-label">{sev}</span>
                    <span className="stat-value" style={{ fontSize: 20, color: sev === "CRITICAL" ? "var(--accent-rose)" : sev === "MAJOR" ? "var(--accent-amber)" : "var(--text-2)" }}>
                      {findings.bySeverity[sev].length}
                    </span>
                  </div>
                ))}
                <div className="col">
                  <span className="section-label">Risk index</span>
                  <span className="stat-value" style={{ fontSize: 20 }}>
                    {findings.risk}
                  </span>
                </div>
              </div>
              <div className="col gap-6 mt-12" style={{ maxHeight: 220, overflow: "auto" }}>
                {findings.all.slice(0, 40).map((f, i) => (
                  <div key={`${f.title}-${i}`} className="row gap-8">
                    <Badge tone={f.severity === "CRITICAL" ? "danger" : f.severity === "MAJOR" ? "warn" : "default"}>{f.severity}</Badge>
                    <span className="tiny truncate">{f.title}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="row gap-6 wrap mt-16">
            <Button
              size="sm"
              icon="copy"
              onClick={async () => {
                if (await copyText(patchDraft())) toast.success("Report copied");
              }}
              disabled={!findings.all.length && !stageState.RESEARCHER}
            >
              Copy report
            </Button>
            <Button size="sm" icon="download" onClick={() => downloadText(`security-audit-${slugify(target).slice(0, 24)}.md`, patchDraft())} disabled={!stageState.RESEARCHER}>
              Export markdown
            </Button>
            <Button
              size="sm"
              icon="book"
              onClick={() => {
                onSaveVault?.(`Audit: ${target.slice(0, 48)}`, patchDraft().slice(0, 4000), "Security");
                toast.success("Saved to the vault");
              }}
              disabled={!stageState.REVIEWER}
            >
              Save to vault
            </Button>
          </div>
          <div className="row gap-6 mt-12">
            <input className="input" placeholder="owner/repo for the issue" value={issueRepo} onChange={(e) => setIssueRepo(e.target.value)} />
            <Button size="sm" icon="external" onClick={openIssue} disabled={!stageState.REVIEWER}>
              File issue
            </Button>
          </div>
        </Card>
      </div>

      {STAGES.map((stage) => {
        const state = stageState[stage.id];
        return (
          <Card
            key={stage.id}
            title={`${stage.label} · ${stage.id}`}
            subtitle={state?.status === "running" ? "Streaming…" : state?.status === "done" ? "Complete" : "Pending"}
            className="mb-12"
            actions={
              <>
                {state?.simulated ? <Badge tone="violet">simulated</Badge> : null}
                {state?.text ? (
                  <>
                    <Button size="sm" variant="ghost" icon="send" onClick={() => { setGoal(`Fix these security findings:\n\n${state.text.slice(0, 3000)}`); onOpenTab("swarm"); }}>
                      Fix with swarm
                    </Button>
                    <Button size="sm" variant="ghost" icon="copy" onClick={async () => { await copyText(state.text); toast.success("Copied"); }}>
                      Copy
                    </Button>
                  </>
                ) : null}
              </>
            }
          >
            {state?.text ? (
              <div style={{ maxHeight: 360, overflow: "auto" }}>
                <Markdown>{state.text}</Markdown>
                {state.status === "running" ? <span className="caret" /> : null}
              </div>
            ) : (
              <EmptyState icon={stage.id === "RESEARCHER" ? "search" : stage.id === "DEBUGGER" ? "bug" : "shield"} title={`${stage.label} has not run`}>
                {stage.id === "RESEARCHER"
                  ? "Recon maps the attack surface before anyone touches the code."
                  : stage.id === "DEBUGGER"
                    ? "The exploit trace turns suspicion into a concrete path with a patch."
                    : "The verdict separates real findings from noise and says what blocks release."}
              </EmptyState>
            )}
          </Card>
        );
      })}
    </div>
  );
}
