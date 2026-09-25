/**
 * The swarm engine: plan → execute → oversee, with abort, retry and progress.
 * All state lives here so every view (swarm, terminal, preview, files) reads
 * from one source of truth.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ApiError,
  FALLBACK_PLAN,
  ORCHESTRATOR_SYSTEM,
  OVERSIGHT_SYSTEM,
  callModel,
  compressContext,
  extractJson,
  hasCreds,
  normalisePlan,
  simulatePlan,
  streamModel,
} from "../lib/api.js";
import { COST_PER_TOK, estimateTokens, formatTastePrompt, scoreFromText } from "../lib/constants.js";

export const PHASES = ["idle", "planning", "running", "overseeing", "done", "aborted", "error"];

const makeLog = () => ({ id: Math.random().toString(36).slice(2), at: Date.now() });

export function useSwarm({ settings, agents, taste, onComplete, onEvent, concurrencyLimit = 4 }) {
  const [phase, setPhase] = useState("idle");
  const [outputs, setOutputs] = useState({});
  const [plan, setPlan] = useState(null);
  const [overseer, setOverseer] = useState("");
  const [log, setLog] = useState([]);
  const [tokens, setTokens] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [goal, setGoal] = useState("");

  const abortRef = useRef(null);
  const timerRef = useRef({});
  const runningRef = useRef(false);

  const logLine = useCallback(
    (text, { agent = "system", level = "info" } = {}) => {
      const entry = { ...makeLog(), agent, level, text };
      setLog((prev) => [...prev.slice(-199), entry]);
      onEvent?.(entry);
    },
    [onEvent],
  );

  const cost = useMemo(() => tokens * COST_PER_TOK, [tokens]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setPhase("idle");
    setOutputs({});
    setPlan(null);
    setOverseer("");
    setLog([]);
    setTokens(0);
    setProgress(0);
    setError("");
    timerRef.current = {};
  }, []);

  const abort = useCallback(() => {
    if (!runningRef.current) return;
    abortRef.current?.abort();
    runningRef.current = false;
    setPhase((p) => (p === "running" || p === "planning" || p === "overseeing" ? "aborted" : p));
    setOutputs((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(next)) if (v.status === "running") next[k] = { ...v, status: "error", text: `${v.text}\n\n[aborted by user]` };
      return next;
    });
    logLine("Run aborted by user.", { level: "warn" });
  }, [logLine]);

  /** Ask the planner to choose agents. Never throws — falls back to a local plan. */
  const makePlan = useCallback(
    async (theGoal, { signal } = {}) => {
      const names = Object.keys(agents);
      const limit = Math.max(2, Math.min(names.length, concurrencyLimit));
      const goalSnippet = theGoal.slice(0, 4000);
      try {
        if (!hasCreds(settings)) return simulatePlan({ settings, goal: goalSnippet, validNames: names, limit });
        const { text } = await callModel({
          settings,
          system: ORCHESTRATOR_SYSTEM(names, limit),
          messages: [{ role: "user", content: goalSnippet }],
          maxTokens: 700,
          signal,
        });
        const parsed = extractJson(text);
        const normalised = normalisePlan(parsed, names, limit);
        if (!normalised.agents.length) throw new Error("planner returned no usable agents");
        return { ...normalised, simulated: false };
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        const fallback = normalisePlan(FALLBACK_PLAN(theGoal), names, limit);
        logLine(`Planner fell back to the local playbook (${err.message}).`, { level: "warn" });
        return { ...fallback, simulated: true, error: err.message };
      }
    },
    [agents, concurrencyLimit, logLine, settings],
  );

  /** Run one agent and stream its output into state. */
  const runAgent = useCallback(
    async ({ name, instruction, contextBlock = "", theGoal, signal, maxTokens }) => {
      const agent = agents[name];
      if (!agent) return "";
      timerRef.current[name] = Date.now();
      setOutputs((prev) => ({ ...prev, [name]: { text: "", status: "running", startedAt: Date.now() } }));
      logLine(`${name} started — ${instruction.slice(0, 120)}`, { agent: name });

      let text = "";
      let simulated = false;
      try {
        const res = await streamModel({
          settings,
          agent: name,
          system: agent.sys + formatTastePrompt(taste),
          messages: [{ role: "user", content: `GOAL: ${theGoal}\n\nYOUR TASK: ${instruction}${contextBlock}` }],
          maxTokens,
          signal,
          onToken: (chunk) => {
            text += chunk;
            setOutputs((prev) => ({ ...prev, [name]: { ...prev[name], text: (prev[name]?.text || "") + chunk, status: "running" } }));
          },
        });
        simulated = res.simulated;
        const finalText = res.text || text;
        const elapsed = ((Date.now() - (timerRef.current[name] || Date.now())) / 1000).toFixed(1);
        const used = estimateTokens(finalText);
        setTokens((t) => t + used);
        setOutputs((prev) => ({
          ...prev,
          [name]: { text: finalText, status: "done", elapsed, tokens: used, simulated, finishedAt: Date.now() },
        }));
        logLine(`${name} finished in ${elapsed}s · ~${used} tokens`, { agent: name, level: "success" });
        return { name, text: finalText, status: "done", elapsed, tokens: used, simulated };
      } catch (err) {
        if (err?.name === "AbortError") {
          setOutputs((prev) => ({ ...prev, [name]: { ...prev[name], status: "error" } }));
          throw err;
        }
        const message = err instanceof ApiError ? err.message : err.message || "unknown error";
        setOutputs((prev) => ({ ...prev, [name]: { text: `⚠️ ${message}`, status: "error", finishedAt: Date.now() } }));
        logLine(`${name} failed: ${message}`, { agent: name, level: "error" });
        return { name, text: "", status: "error", error: message };
      }
    },
    [agents, logLine, settings, taste],
  );

  const runOverseer = useCallback(
    async ({ theGoal, ctx, signal, maxTokens }) => {
      setPhase("overseeing");
      setProgress(88);
      logLine("Overseer is scoring the delivery…", { agent: "OVERSEER" });
      let text = "";
      if (!ctx.length) {
        setOverseer("No agent produced output, so there was nothing to evaluate. Check Settings and re-run.");
        return "";
      }
      try {
        const res = await streamModel({
          settings,
          system: OVERSIGHT_SYSTEM,
          messages: [
            {
              role: "user",
              content: `GOAL: ${theGoal}\n\nDELIVERED OUTPUT:\n${ctx.map((c) => `[${c.agent}]\n${String(c.output).slice(0, 6000)}`).join("\n\n---\n\n")}`,
            },
          ],
          maxTokens: Math.min(maxTokens, 1400),
          signal,
          onToken: (chunk) => {
            text += chunk;
            setOverseer((prev) => prev + chunk);
          },
        });
        if (res.simulated) text = res.text;
        setTokens((t) => t + estimateTokens(text));
        return text;
      } catch (err) {
        if (err?.name === "AbortError") return text;
        const message = `Overseer could not run: ${err.message}`;
        setOverseer(message);
        logLine(message, { agent: "OVERSEER", level: "error" });
        return message;
      }
    },
    [logLine, settings],
  );

  /**
   * Execute a full run. Pass `fixedAgents` to skip planning (used by Canvas
   * flows and retries).
   */
  const run = useCallback(
    async (theGoal, options = {}) => {
      const {
        chainMode = false,
        parallel = false,
        maxTokens = 1800,
        fixedAgents = null,
        skipOverseer = false,
      } = options;
      const trimmed = String(theGoal || "").trim();
      if (!trimmed) return { ok: false, error: "A goal is required." };
      if (runningRef.current) return { ok: false, error: "A run is already in progress." };

      runningRef.current = true;
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      setGoal(trimmed);
      setOutputs({});
      setOverseer("");
      setTokens(0);
      setProgress(0);
      setError("");
      setLog([]);
      logLine(`Goal received (${trimmed.length} chars).`);
      logLine(hasCreds(settings) ? `Model: ${settings.model}` : "No credentials — running the offline simulation engine.", {
        level: hasCreds(settings) ? "info" : "warn",
      });

      try {
        let chosen = fixedAgents;
        if (!chosen) {
          setPhase("planning");
          const planned = await makePlan(trimmed, { signal });
          setPlan(planned);
          chosen = planned.agents;
          setProgress(8);
          logLine(`Plan: ${planned.agents.map((a) => a.name).join(parallel ? " ∥ " : " → ")}${planned.rationale ? ` — ${planned.rationale}` : ""}`);
        } else {
          setPlan({ agents: chosen, rationale: "Manual topology from the Canvas.", simulated: false });
          logLine(`Manual topology: ${chosen.map((a) => a.name).join(" → ")}`);
        }
        if (!chosen?.length) throw new Error("The planner returned no agents to run.");

        setPhase("running");
        const ctx = [];
        const finals = {};
        const total = chosen.length;

        const step = async (entry, index, contextBlock) => {
          if (signal.aborted) return;
          const result = await runAgent({
            name: entry.name,
            instruction: entry.instruction || `Contribute your ${entry.name} expertise.`,
            contextBlock,
            theGoal: trimmed,
            signal,
            maxTokens,
          });
          if (result && result.status === "done") {
            ctx.push({ agent: entry.name, output: result.text, tokens: result.tokens });
            finals[entry.name] = result;
          }
          setProgress(Math.round(((index + 1) / total) * 82));
        };

        if (parallel) {
          const queue = [...chosen.entries()];
          const workers = Array.from({ length: Math.min(concurrencyLimit, queue.length) }, async () => {
            for (;;) {
              const next = queue.shift();
              if (!next || signal.aborted) return;
              await step(next[1], next[0], "");
            }
          });
          await Promise.all(workers);
        } else {
          for (let i = 0; i < chosen.length; i += 1) {
            if (signal.aborted) break;
            let contextBlock = "";
            if (i > 0 && ctx.length) {
              if (chainMode) {
                contextBlock = `\n\n--- PRIOR AGENT OUTPUT (build directly on this) ---\n${ctx.map((c) => `[${c.agent}]\n${String(c.output).slice(0, 8000)}`).join("\n\n---\n")}`;
              } else if (ctx.length >= 2) {
                contextBlock = await compressContext({ ctx, goal: trimmed, settings });
              } else {
                contextBlock = `\n\nPRIOR OUTPUT:\n${ctx.map((c) => `[${c.agent}]: ${String(c.output).slice(0, 1200)}`).join("\n\n")}`;
              }
            }
            await step(chosen[i], i, contextBlock);
          }
        }

        if (signal.aborted) {
          runningRef.current = false;
          return { ok: false, aborted: true, outputs: finals, overseer: "" };
        }

        let verdict = "";
        if (!skipOverseer) verdict = await runOverseer({ theGoal: trimmed, ctx, signal, maxTokens });

        setProgress(100);
        setPhase("done");
        runningRef.current = false;
        const totalTokens = ctx.reduce((sum, c) => sum + (c.tokens || estimateTokens(c.output)), 0);
        logLine(`Run complete — ${totalTokens} tokens, ${fmt(costOf(totalTokens))}.`, { level: "success" });
        const payload = {
          goal: trimmed,
          agents: finals,
          overseer: verdict,
          tokens: totalTokens,
          cost: totalTokens * COST_PER_TOK,
          score: scoreFromText(verdict),
          simulated: hasCreds(settings) ? false : true,
          plan: chosen,
          finishedAt: new Date().toISOString(),
        };
        await onComplete?.(payload);
        return { ok: true, ...payload };
      } catch (err) {
        runningRef.current = false;
        if (err?.name === "AbortError") {
          setPhase("aborted");
          return { ok: false, aborted: true };
        }
        setPhase("error");
        setError(err.message || "Run failed");
        logLine(`Run failed: ${err.message}`, { level: "error" });
        return { ok: false, error: err.message };
      }
    },
    [concurrencyLimit, logLine, makePlan, onComplete, runAgent, runOverseer, settings],
  );

  /** Re-run one agent with an optional extra instruction. */
  const retryAgent = useCallback(
    async (name, extra = "") => {
      if (!goal) return;
      abortRef.current = abortRef.current || new AbortController();
      const previous = outputs[name]?.text || "";
      setPhase("running");
      const result = await runAgent({
        name,
        instruction: `${extra || "Re-do your part of this goal, correcting any weaknesses."}\n\nYour previous attempt is below — improve it and fix mistakes:\n${String(previous).slice(0, 4000)}`,
        theGoal: goal,
        signal: abortRef.current.signal,
        maxTokens: settings.maxTokens || 1800,
      });
      setPhase("done");
      return result;
    },
    [goal, outputs, runAgent, settings.maxTokens],
  );

  /** Retry every agent that failed. */
  const retryFailed = useCallback(async () => {
    const failed = Object.entries(outputs).filter(([, v]) => v.status === "error").map(([k]) => k);
    for (const name of failed) {
      await retryAgent(name, "Your previous attempt errored out. Produce the full deliverable now.");
    }
    return failed.length;
  }, [outputs, retryAgent]);

  return {
    phase,
    outputs,
    plan,
    overseer,
    log,
    tokens,
    cost,
    progress,
    error,
    goal,
    isRunning: phase === "running" || phase === "planning" || phase === "overseeing",
    run,
    retryAgent,
    retryFailed,
    abort,
    reset,
    /** Plan without executing — powers the "review the plan first" flow. */
    previewPlan: makePlan,
    setGoals: setGoal,
    setOverseer,
    setOutputs,
    setPlan,
    setLog,
  };
}

const fmt = (n) => `$${(Number(n) || 0).toFixed(5)}`;
const costOf = (t) => (Number(t) || 0) * COST_PER_TOK;
