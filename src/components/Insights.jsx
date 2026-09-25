import { useMemo, useState } from "react";
import { Badge, BarChart, BarRow, Button, Card, EmptyState, Sparkline, Stat } from "./ui.jsx";
import { AGENT_KEYS, COST_PER_TOK, modelLabel } from "../lib/constants.js";
import { downloadText, toCsv } from "../lib/store.js";

const dayLabel = (d) => d.toLocaleDateString([], { weekday: "narrow" });

/** Analytics dashboard: volume, spend, quality and which agents earn their keep. */
export default function Insights({ runs, plan, onOpenTab }) {
  // Captured once per mount so the chart window is stable across re-renders.
  const [now] = useState(() => Date.now());
  const stats = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(now - (13 - i) * 86400000);
      const key = day.toISOString().slice(0, 10);
      return { label: dayLabel(day), key, value: runs.filter((r) => (r.created_at || "").slice(0, 10) === key).length };
    });
    const scores = runs.map((r) => Number(r.score)).filter((n) => !Number.isNaN(n));
    const tokens = runs.reduce((sum, r) => sum + (Number(r.tokens_used) || 0), 0);
    const cost = runs.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
    const perAgent = Object.fromEntries(AGENT_KEYS.map((k) => [k, 0]));
    for (const run of runs) {
      for (const name of Object.keys(run.agents || {})) if (perAgent[name] !== undefined) perAgent[name] += 1;
    }
    const models = {};
    for (const run of runs) {
      const key = run.model || "unrecorded";
      models[key] = models[key] || { runs: 0, tokens: 0 };
      models[key].runs += 1;
      models[key].tokens += Number(run.tokens_used) || 0;
    }
    const today = runs.filter((r) => new Date(r.created_at) > new Date(now - 86400000)).length;
    return {
      days,
      scores,
      avgScore: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
      tokens,
      cost,
      perAgent,
      models,
      today,
      withScore: scores.length,
      failures: runs.filter((r) => Object.values(r.agents || {}).some((a) => a?.status === "error")).length,
    };
  }, [runs, now]);

  const maxAgent = Math.max(1, ...Object.values(stats.perAgent));

  if (!runs.length) {
    return (
      <div>
        <Head />
        <EmptyState icon="chart" title="No runs recorded yet" action={<Button variant="primary" icon="rocket" onClick={() => onOpenTab("swarm")}>Run a mission</Button>}>
          Once runs are saved — locally or in Supabase — this view reports volume, spend, quality trend and agent load.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <Head onExport={() => downloadText(`neural-swarm-runs-${Date.now()}.csv`, toCsv(runs, ["created_at", "goal", "branch", "version_num", "score", "tokens_used", "cost", "model"]), "text/csv")} />

      <div className="grid-4 mb-16">
        <Stat label="Runs" value={runs.length} sub={`${stats.today} in the last 24h`} icon="activity" tone="var(--accent)" />
        <Stat label="Tokens" value={stats.tokens.toLocaleString()} sub={`${(stats.tokens * COST_PER_TOK).toFixed(4)} USD at the blended rate`} icon="cpu" tone="var(--accent-cyan)" />
        <Stat label="Avg score" value={stats.avgScore ? `${stats.avgScore}/10` : "—"} sub={`${stats.withScore} scored runs`} icon="star" tone="var(--accent-amber)" />
        <Stat label="Spend" value={`$${stats.cost.toFixed(4)}`} sub={`${stats.failures} runs had a failed agent`} icon="gauge" tone="var(--accent-violet)" />
      </div>

      <div className="grid-2 mb-16" style={{ alignItems: "start" }}>
        <Card title="Volume" subtitle="Runs per day, last 14 days">
          <BarChart data={stats.days} color="var(--accent)" />
          <div className="row between mt-12">
            <span className="dimmer tiny">Peak day: {Math.max(...stats.days.map((d) => d.value))} runs</span>
            <Badge tone="accent">{plan.toUpperCase()} plan</Badge>
          </div>
        </Card>
        <Card title="Quality trend" subtitle="Overseer score per run, oldest → newest">
          <Sparkline data={stats.scores} color="var(--accent-amber)" height={92} label="score trend" />
          <div className="row between mt-12">
            <span className="dimmer tiny">
              {stats.scores.length >= 2 ? `Best ${Math.max(...stats.scores)} · worst ${Math.min(...stats.scores)}` : "Two scored runs are needed for a trend."}
            </span>
            <span className="dimmer tiny mono">avg {stats.avgScore || "—"}</span>
          </div>
        </Card>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Card title="Agent utilisation" subtitle="How often each specialist was picked">
          <div className="col gap-8">
            {Object.entries(stats.perAgent)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <BarRow key={name} label={name} value={count} max={maxAgent} color={`var(--accent)`} />
              ))}
          </div>
          <div className="dimmer tiny mt-12">Idle agents usually mean the planner is scoping the goal narrowly — try Chain mode for broader coverage.</div>
        </Card>
        <Card title="Models" subtitle="Where the tokens went">
          <div className="col gap-10">
            {Object.entries(stats.models).map(([model, data]) => (
              <div key={model} className="row between inset" style={{ padding: "8px 10px" }}>
                <span className="col">
                  <span className="small strong">{modelLabel(model)}</span>
                  <span className="dimmer tiny mono">{model}</span>
                </span>
                <span className="col" style={{ alignItems: "flex-end" }}>
                  <span className="small mono">{data.tokens.toLocaleString()} tok</span>
                  <span className="dimmer tiny">
                    {data.runs} run{data.runs === 1 ? "" : "s"} · ${(data.tokens * COST_PER_TOK).toFixed(4)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Head({ onExport }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">Insights</h1>
        <p className="page-sub">Volume, spend, quality and utilisation across every recorded run.</p>
      </div>
      {onExport ? (
        <Button icon="download" onClick={onExport}>
          Export CSV
        </Button>
      ) : null}
    </div>
  );
}
