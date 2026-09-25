import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Modal, SearchInput, Select, Textarea, Field, Input } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import { CATEGORIES, SORTS } from "../lib/constants.js";
import { hasCreds, streamModel } from "../lib/api.js";

/**
 * Template marketplace: eight curated workflows, community submissions from
 * Supabase, and a generative search that writes a bespoke workflow on demand.
 */
export default function Marketplace({ templates, purchased, onUse, onFork, onPublish, canPublish, onOpenTab, settings, goal }) {
  const toast = useToast();
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(SORTS[0]);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genOut, setGenOut] = useState(null);
  const [generating, setGenerating] = useState(false);

  const filtered = useMemo(() => {
    const rank = (t) => (Number(t.rating) || 0) * 2 + Math.log10((t.usage || 0) + 1);
    return templates
      .filter((t) => (cat === "All" || t.cat === cat) && (!query || `${t.name} ${t.desc} ${(t.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase())))
      .sort((a, b) => (sort === "Popular" ? (b.usage || 0) - (a.usage || 0) : sort === "Top rated" ? rank(b) - rank(a) : 0));
  }, [templates, cat, query, sort]);

  const generate = async () => {
    if (!hasCreds(settings)) return toast.warn("Workflow generation needs a model connection — add a key in Settings.");
    setGenerating(true);
    setGenOut(null);
    try {
      let text = "";
      const res = await streamModel({
        settings,
        system:
          "You design agent workflows. Reply with ONLY JSON: {\"name\":\"…\",\"desc\":\"…\",\"cat\":\"Build|Debug|Research|Marketing|Design|Other\",\"tags\":[\"…\"],\"goal\":\"…\",\"agents\":[\"AGENT\",…]}. AGENT values come from ARCHITECT, RESEARCHER, CODER, DEBUGGER, TESTER, REVIEWER, REFACTORER, ANALYST, WRITER, DESIGNER.",
        messages: [{ role: "user", content: `Design the best workflow for: ${genPrompt}${goal ? `\n\nContext — the goal currently loaded in the studio: ${goal}` : ""}` }],
        maxTokens: 700,
        onToken: (c) => {
          text += c;
        },
      });
      const parsed = JSON.parse((String(res.text || text).match(/\{[\s\S]*\}/) || ["{}"])[0]);
      if (!parsed.name) throw new Error("The model did not return a usable workflow.");
      setGenOut(parsed);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Marketplace</h1>
          <p className="page-sub">{templates.length} workflows · install one with a click, fork it, or generate a bespoke topology from a sentence.</p>
        </div>
        <div className="row gap-8">
          <Button icon="wand" onClick={() => setGenOpen(true)}>
            Generate workflow
          </Button>
          <Button variant="primary" icon="upload" onClick={() => (canPublish ? onPublish() : toast.warn("Run something first, then publish it as a template."))}>
            Publish current run
          </Button>
        </div>
      </div>

      <div className="toolbar mb-16">
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" onClear={() => setQuery("")} className="grow" />
        <div className="row gap-4 wrap">
          {CATEGORIES.map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} style={{ width: 140 }} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="cart" title="No template matches that filter">
          Clear the search or pick another category.
        </EmptyState>
      ) : (
        <div className="auto-grid">
          {filtered.map((t) => {
            const owned = t.price === 0 || purchased.has(t.id);
            return (
              <Card key={t.id} className="feature-card" pad>
                <div className="row between">
                  <Badge tone={owned ? "accent" : "warn"}>{owned ? "included" : `$${t.price}`}</Badge>
                  {t.rating ? <Badge tone="default">★ {t.rating}</Badge> : null}
                </div>
                <div className="strong mt-8" style={{ color: t.color || "var(--accent)" }}>
                  {t.name}
                </div>
                <p className="tiny muted mt-4" style={{ minHeight: 48 }}>
                  {t.desc}
                </p>
                <div className="row gap-4 wrap mt-8">
                  {(t.tags || []).slice(0, 3).map((tag) => (
                    <Badge key={tag}>#{tag}</Badge>
                  ))}
                </div>
                <div className="row between mt-12">
                  <span className="dimmer tiny">{t.usage} installs{t.creator ? ` · ${String(t.creator).split("@")[0]}` : ""}</span>
                </div>
                <div className="row gap-6 mt-12">
                  <Button size="sm" variant={owned ? "primary" : "default"} icon={owned ? "play" : "cart"} onClick={() => onUse(t)} className="grow">
                    {owned ? "Use" : `Buy $${t.price}`}
                  </Button>
                  <Button size="sm" variant="ghost" icon="gitBranch" onClick={() => onFork(t)} title="Fork and edit">
                    Fork
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate a workflow"
        subtitle="Describe the outcome; the planner designs the pipeline"
        footer={
          <>
            <Button onClick={() => setGenOpen(false)}>Close</Button>
            <Button
              variant="primary"
              disabled={!genOut}
              onClick={() => {
                onUse({ id: `gen-${Date.now()}`, name: genOut.name, goal: genOut.goal, agents: genOut.agents, desc: genOut.desc, price: 0, tags: genOut.tags || [] });
                setGenOpen(false);
              }}
            >
              Install & use
            </Button>
          </>
        }
      >
        <div className="col gap-12">
          <Field label="What do you want the workflow to do?">
            <Input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder="Ship a Stripe-billed API with a security review" />
          </Field>
          {goal.trim() ? (
            <button className="btn btn-sm btn-ghost mt-8" onClick={() => setGenPrompt(goal.slice(0, 200))}>
              <Icon name="wand" size={12} /> Use the studio goal
            </button>
          ) : null}
          <Button icon="wand" onClick={generate} disabled={generating || !genPrompt.trim()}>
            {generating ? "Designing…" : "Design it"}
          </Button>
          {genOut ? (
            <div className="inset" style={{ padding: 12 }}>
              <div className="row between">
                <span className="strong small">{genOut.name}</span>
                <Badge tone="accent">{genOut.cat}</Badge>
              </div>
              <p className="tiny muted mt-4">{genOut.desc}</p>
              <div className="row gap-6 wrap mt-8">
                {(genOut.agents || []).map((a) => (
                  <Badge key={a} tone="violet">
                    <Icon name="flow" size={10} /> {a}
                  </Badge>
                ))}
              </div>
              <Textarea readOnly value={genOut.goal} className="mt-12" style={{ minHeight: 90, fontSize: 12 }} />
            </div>
          ) : (
            <div className="hint">Generated workflows are session-only — publish one to make it permanent.</div>
          )}
        </div>
      </Modal>

      <div className="dimmer tiny mt-16">
        Built-in templates are free forever. Community submissions can be priced — checkout runs through the Supabase Stripe function.{" "}
        <button className="btn btn-sm btn-ghost" onClick={() => onOpenTab("swarm")}>
          Back to the studio
        </button>
      </div>
    </div>
  );
}
