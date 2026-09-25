import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Progress, Select, Textarea } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import Markdown from "./Markdown.jsx";
import { callModel, hasCreds } from "../lib/api.js";
import { copyText, downloadText } from "../lib/store.js";

const DEPTHS = {
  quick: { label: "Quick scan", subQuestions: 3, tokens: 900 },
  standard: { label: "Standard brief", subQuestions: 5, tokens: 1400 },
  deep: { label: "Deep dive", subQuestions: 7, tokens: 2000 },
};

/**
 * Deep-research hub: decompose the question, answer each sub-question, then
 * synthesise one brief with an explicit "what I could not verify" section.
 */
export default function Research({ settings, onInjectGoal, onSaveVault, isGated, onUpgrade }) {
  const toast = useToast();
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState("standard");
  const [lens, setLens] = useState("technical");
  const [subQuestions, setSubQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [brief, setBrief] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const research = async () => {
    if (isGated) return onUpgrade?.();
    if (!question.trim()) return toast.warn("Ask a research question first.");
    if (!hasCreds(settings)) return toast.warn("Research needs a model connection — add a key in Settings.");
    setBusy(true);
    setSubQuestions([]);
    setAnswers({});
    setBrief("");
    setProgress(4);
    try {
      const plan = await callModel({
        settings,
        system:
          "You break a research question into the smallest set of independent sub-questions that fully answer it. Reply with ONLY a JSON array of strings.",
        messages: [{ role: "user", content: `Question: ${question}\nLens: ${lens}\nProduce ${DEPTHS[depth].subQuestions} sub-questions.` }],
        maxTokens: 400,
      });
      let list = [];
      try {
        const parsed = JSON.parse((plan.text.match(/\[[\s\S]*\]/) || ["[]"])[0]);
        list = Array.isArray(parsed) ? parsed.map(String).slice(0, DEPTHS[depth].subQuestions) : [];
      } catch {
        list = [];
      }
      if (!list.length) list = [`What is the core answer to: ${question}`];
      setSubQuestions(list);

      const collected = [];
      for (let i = 0; i < list.length; i += 1) {
        const sq = list[i];
        const res = await callModel({
          settings,
          system: `You are a rigorous analyst answering one sub-question through the ${lens} lens. Be concrete, name versions and numbers where they matter, and state clearly when something cannot be verified without live sources. Max 220 words.`,
          messages: [{ role: "user", content: `Main question: ${question}\n\nSub-question: ${sq}` }],
          maxTokens: Math.round(DEPTHS[depth].tokens / list.length) + 300,
        });
        collected.push(`### ${sq}\n\n${res.text}`);
        setAnswers((prev) => ({ ...prev, [sq]: res.text }));
        setProgress(Math.round(((i + 1) / (list.length + 1)) * 95));
      }

      const synthesis = await callModel({
        settings,
        system:
          "You are the lead analyst. Synthesise the findings into an executive brief: `## Bottom line`, `## Evidence`, `## Tradeoffs`, `## What we could not verify`, `## Recommendation`. Do not invent sources.",
        messages: [{ role: "user", content: `Question: ${question}\n\nFindings:\n${collected.join("\n\n")}` }],
        maxTokens: 1600,
      });
      setBrief(synthesis.text);
      setProgress(100);
      toast.success("Brief ready");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Deep research</h1>
          <p className="page-sub">Ask once. The desk splits the question, answers every part, then writes one brief that names its own gaps.</p>
        </div>
      </div>

      <div className="grid-2 mb-12" style={{ alignItems: "start" }}>
        <Card title="Question">
          <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Which Postgres hosting approach should a two-person team pick in 2026, and what breaks at 10k daily users?" style={{ minHeight: 130 }} aria-label="Research question" />
          <div className="grid-2 mt-12">
            <Field label="Depth">
              <Select value={depth} onChange={(e) => setDepth(e.target.value)} options={Object.entries(DEPTHS).map(([v, d]) => ({ value: v, label: `${d.label} · ${d.subQuestions} angles` }))} />
            </Field>
            <Field label="Lens">
              <Select value={lens} onChange={(e) => setLens(e.target.value)} options={["technical", "commercial", "security", "user experience"]} />
            </Field>
          </div>
          <div className="row gap-8 mt-12">
            <Button variant="primary" icon="search" onClick={research} disabled={busy}>
              {busy ? "Researching…" : "Run research"}
            </Button>
            {brief ? (
              <>
                <Button icon="send" onClick={() => onInjectGoal(`Using this research brief, build the implementation:\n\n${brief.slice(0, 3000)}`)}>
                  Turn into a build goal
                </Button>
                <Button variant="ghost" icon="book" onClick={() => onSaveVault?.(question.slice(0, 60), brief, "Research")}>
                  Save to vault
                </Button>
                <Button variant="ghost" icon="download" onClick={() => downloadText(`research-${Date.now()}.md`, `# ${question}\n\n${brief}`)}>
                  Export
                </Button>
              </>
            ) : null}
          </div>
          {busy || progress ? (
            <div className="mt-16">
              <Progress value={progress} />
              <div className="row between mt-8">
                <span className="dimmer tiny">{subQuestions.length} sub-questions · answers stay on this device</span>
                <span className="dimmer tiny mono">{progress}%</span>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Brief" subtitle={brief ? "Synthesis of every answered sub-question" : "Pending"}>
          {brief ? (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <Markdown>{brief}</Markdown>
            </div>
          ) : (
            <EmptyState icon="book" title="No brief yet">
              Research runs entirely against your configured model — no external browsing. Anything the model cannot verify is listed explicitly under “What we could not verify”.
            </EmptyState>
          )}
          {brief ? (
            <div className="row gap-6 mt-12">
              <Button size="sm" variant="ghost" icon="copy" onClick={async () => { await copyText(brief); toast.success("Brief copied"); }}>
                Copy
              </Button>
              <Button size="sm" variant="ghost" icon="layers" onClick={() => setBrief("")}>
                Clear
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      {subQuestions.length ? (
        <div className="auto-grid">
          {subQuestions.map((sq, i) => (
            <Card key={sq} title={`${i + 1}. ${sq.slice(0, 60)}${sq.length > 60 ? "…" : ""}`} subtitle={answers[sq] ? "Answered" : "Queued"} pad>
              {answers[sq] ? <div style={{ maxHeight: 200, overflow: "auto" }}><Markdown>{answers[sq]}</Markdown></div> : <div className="row gap-8 dim tiny"><Icon name="clock" size={13} /> waiting…</div>}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
