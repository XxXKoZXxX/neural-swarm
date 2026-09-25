import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "./components/Shell.jsx";
import Landing from "./components/Landing.jsx";
import SwarmView from "./components/SwarmView.jsx";
import PreviewStudio from "./components/PreviewStudio.jsx";
import Workspace from "./components/Workspace.jsx";
import Terminal from "./components/Terminal.jsx";
import Canvas from "./components/Canvas.jsx";
import SecurityDesk from "./components/SecurityDesk.jsx";
import Research from "./components/Research.jsx";
import Vault from "./components/Vault.jsx";
import Marketplace from "./components/Marketplace.jsx";
import History from "./components/History.jsx";
import Insights from "./components/Insights.jsx";
import Brain from "./components/Brain.jsx";
import { AuthModal, PublishModal, UpgradeModal } from "./components/Account.jsx";
import NeuralBackground from "./components/Background.jsx";
import { Button, Modal } from "./components/ui.jsx";
import { useToast } from "./hooks/useToast.js";
import { Icon } from "./components/icons.jsx";
import { useSwarm } from "./hooks/useSwarm.js";
import useRoute from "./hooks/useRoute.js";
import useWorkspace from "./hooks/useWorkspace.js";
import { AGENTS, BUILTIN_TEMPLATES, DEFAULT_MODEL, FREE_LIMIT, PLAN_TOKENS, STORAGE, uid } from "./lib/constants.js";
import { TAB_ORDER } from "./lib/router.js";
import { downloadText, mkDb, readSession, readStored, writeSession, writeStored } from "./lib/store.js";

const DEFAULT_SETTINGS = {
  anthropicKey: "",
  geminiKey: "",
  proxyUrl: "",
  supabaseUrl: "",
  supabaseKey: "",
  webhookUrl: "",
  model: DEFAULT_MODEL,
  maxTokens: PLAN_TOKENS.free,
  temperature: 1,
  rememberKeys: false,
  runOptions: { chainMode: false, parallel: false },
};

const DEFAULT_MEMORY = {
  enabled: true,
  level: 1,
  xp: 0,
  likes: ["Explicit error handling", "Typed interfaces over loose objects", "A HOW TO RUN section in every build"],
  dislikes: ["Placeholder functions that pretend to work", "Hard-coded secrets"],
  rules: ["Prefer boring, well-supported dependencies"],
  log: [],
};

const SAMPLE_GOAL = "Build a production-ready SaaS starter with Supabase auth, row-level security and Stripe subscription webhooks.";

const currentMonth = () => new Date().getMonth();

export default function App() {
  const toast = useToast();
  // Every view is addressable (#/files?path=src/app.js) so back/forward and
  // shared links work. `home` is the bare hash — the landing page.
  const { home, tab, params, navigate, goHome, goBack } = useRoute();
  const view = home ? "landing" : "studio";
  const openTab = useCallback((next, nextParams = {}) => navigate(next, nextParams), [navigate]);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "dark");
  const [goal, setGoal] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [onboarding, setOnboarding] = useState(() => !readStored(STORAGE.onboarded, false));
  const [publishOpen, setPublishOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [demoUnlocked, setDemoUnlocked] = useState(false);
  const [session, setSession] = useState(() => readStored("ns.session", null));
  const [runs, setRuns] = useState(() => readStored(STORAGE.runs, []));
  const [runsLoading, setRunsLoading] = useState(false);
  const [dbTemplates, setDbTemplates] = useState([]);
  const [purchased, setPurchased] = useState([]);
  const [vault, setVault] = useState(() => readStored(STORAGE.vault, []));
  const [memory, setMemory] = useState(() => ({ ...DEFAULT_MEMORY, ...readStored(STORAGE.memory, {}) }));
  const [customAgents, setCustomAgents] = useState(() => readStored(STORAGE.agents, []));
  const [usage, setUsage] = useState(() => {
    const stored = readStored(STORAGE.usage, { count: 0, month: currentMonth() });
    return stored.month === currentMonth() ? stored : { count: 0, month: currentMonth() };
  });
  const [plan, setPlan] = useState("free");

  /* ── settings, with keys split out of local storage ──────────────────── */
  // Secrets live in sessionStorage unless the user opts into remembering them,
  // so they are read back at construction time rather than in an effect.
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...readStored(STORAGE.settings, {}),
    ...(readSession("ns.secrets", null) || {}),
  }));
  useEffect(() => {
    const { anthropicKey, geminiKey, supabaseKey } = settings;
    writeStored(STORAGE.settings, { ...settings, anthropicKey: "", geminiKey: "", supabaseKey: "" });
    writeSession("ns.secrets", { anthropicKey, geminiKey, supabaseKey });
  }, [settings]);

  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE.theme, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  // Persist to localStorage. The bodies are wrapped so the effect returns
  // `undefined` — returning a value makes React treat it as a cleanup fn.
  useEffect(() => {
    writeStored(STORAGE.vault, vault);
  }, [vault]);
  useEffect(() => {
    writeStored(STORAGE.memory, memory);
  }, [memory]);
  useEffect(() => {
    writeStored(STORAGE.usage, usage);
  }, [usage]);
  useEffect(() => {
    writeStored(STORAGE.agents, customAgents);
  }, [customAgents]);
  useEffect(() => {
    writeStored("ns.session", session ?? null);
  }, [session]);

  /* ── data layer ──────────────────────────────────────────────────────── */
  const jwt = session?.access_token || settings.supabaseKey;
  const db = useMemo(
    () => (settings.supabaseUrl && settings.supabaseKey ? mkDb(settings.supabaseUrl, settings.supabaseKey, jwt) : null),
    [settings.supabaseUrl, settings.supabaseKey, jwt],
  );

  const agentMap = useMemo(
    () => ({ ...AGENTS, ...Object.fromEntries(customAgents.map((a) => [a.name, { icon: a.i || "⬡", color: a.c || "#22d3ee", role: "Custom", blurb: "Custom specialist", sys: a.sys || "" }])) }),
    [customAgents],
  );

  const persistRun = useCallback(
    async (payload) => {
      const local = {
        id: uid("run"),
        goal: payload.goal,
        branch: "main",
        version_num: readStored(STORAGE.runs, []).length + 1,
        agents: Object.fromEntries(
          Object.entries(payload.agents).map(([k, v]) => [k, { text: v.text, status: v.status, elapsed: v.elapsed, tokens: v.tokens }]),
        ),
        overseer: payload.overseer,
        score: payload.score,
        tokens_used: payload.tokens,
        cost: payload.cost,
        model: settings.model,
        created_at: new Date().toISOString(),
        simulated: payload.simulated,
      };
      writeStored(STORAGE.runs, [local, ...readStored(STORAGE.runs, [])].slice(0, 60));
      setRuns((prev) => [local, ...prev].slice(0, 60));

      if (db) {
        try {
          await db.insert("agent_runs", {
            goal: payload.goal,
            branch: "main",
            version_num: local.version_num,
            run_message: `v${local.version_num}`,
            agents: local.agents,
            overseer: payload.overseer,
            score: payload.score ? `${payload.score}/10` : null,
            tokens_used: payload.tokens,
            cost: payload.cost.toFixed(6),
            model: settings.model,
            user_email: session?.email || null,
            is_template: false,
          });
        } catch (err) {
          toast.warn(`Saved locally — Supabase rejected the row: ${err.message}`);
        }
      }

      if (settings.webhookUrl) {
        try {
          await fetch(settings.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goal: payload.goal, score: payload.score, tokens: payload.tokens, cost: payload.cost, agents: Object.keys(payload.agents), overseer: payload.overseer, model: settings.model, at: local.created_at }),
          });
          toast.success("Webhook delivered");
        } catch (err) {
          toast.warn(`Webhook failed: ${err.message}`);
        }
      }
      return local;
    },
    [db, session, settings.model, settings.webhookUrl, toast],
  );

  const evolveMemory = useCallback((payload) => {
    setMemory((prev) => {
      if (!prev.enabled) return prev;
      const haystack = `${payload.goal}\n${Object.values(payload.agents).map((a) => a.text).join("\n")}\n${payload.overseer}`;
      const signals = [
        [/TypeScript|\.ts\b/, "TypeScript-first implementations"],
        [/Supabase|row level security|RLS/i, "Supabase + row-level security"],
        [/Stripe/, "Stripe billing flows"],
        [/vitest|jest|playwright/i, "Automated test coverage"],
        [/Postgres/i, "Postgres as the primary store"],
        [/accessib|a11y/i, "Accessibility checks"],
      ]
        .filter(([re]) => re.test(haystack))
        .map(([, label]) => label);
      const xp = (prev.xp || 0) + 25;
      return {
        ...prev,
        likes: [...new Set([...(prev.likes || []), ...signals])],
        xp,
        level: Math.floor(xp / 100) + 1,
        log: [`[${new Date().toLocaleTimeString()}] Observed ${signals.length} pattern(s) from a run · +25 XP`, ...(prev.log || [])].slice(0, 40),
      };
    });
  }, []);

  const handleFeedback = useCallback(
    (agent, kind, output) => {
      setMemory((prev) => {
        const snippet = String(output || "").replace(/\s+/g, " ").slice(0, 90);
        const entry = `[${new Date().toLocaleTimeString()}] ${kind === "like" ? "👍" : "👎"} ${agent}: ${snippet}`;
        if (kind === "like") {
          const xp = (prev.xp || 0) + 10;
          return { ...prev, xp, level: Math.floor(xp / 100) + 1, log: [entry, ...(prev.log || [])].slice(0, 40) };
        }
        return {
          ...prev,
          dislikes: [...new Set([...(prev.dislikes || []), `${agent}: prefer complete, concrete deliverables over hedged summaries`])],
          xp: (prev.xp || 0) + 20,
          level: Math.floor(((prev.xp || 0) + 20) / 100) + 1,
          log: [entry, ...(prev.log || [])].slice(0, 40),
        };
      });
      toast.success(kind === "like" ? "Noted — that style gets reinforced" : "Noted — that pattern is now avoided");
    },
    [toast],
  );

  const swarm = useSwarm({
    settings,
    agents: agentMap,
    taste: memory,
    concurrencyLimit: plan === "free" ? 4 : 10,
    onComplete: async (payload) => {
      await persistRun(payload);
      evolveMemory(payload);
      setUsage((u) => ({ ...u, count: u.count + 1 }));
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Neural Swarm — run complete", { body: payload.goal.slice(0, 120) });
      }
    },
  });

  const workspace = useWorkspace(swarm.outputs);
  const isGated = plan === "free" && usage.count >= FREE_LIMIT && !demoUnlocked;

  /* ── loads ───────────────────────────────────────────────────────────── */
  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const localRuns = readStored(STORAGE.runs, []);
      let remote = [];
      if (db) {
        try {
          remote = await db.select("agent_runs", "select=*&order=created_at.desc&limit=50");
        } catch (err) {
          toast.warn(`Supabase history unavailable: ${err.message}`);
        }
      }
      const merged = [...remote, ...localRuns].filter(
        (r, i, all) => all.findIndex((x) => x.id === r.id || (x.created_at === r.created_at && x.goal === r.goal)) === i,
      );
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRuns(merged.slice(0, 60));
    } finally {
      setRunsLoading(false);
    }
  }, [db, toast]);

  const loadPlan = useCallback(async () => {
    if (!db || !session?.email) return setPlan("free");
    try {
      const rows = await db.select("subscriptions", `select=plan,status&user_email=eq.${encodeURIComponent(session.email)}`);
      const active = rows.find((r) => ["active", "trialing"].includes(r.status));
      setPlan(active?.plan || "free");
    } catch {
      /* no subscriptions table yet — stay on free */
    }
  }, [db, session]);

  const loadTemplates = useCallback(async () => {
    if (!db) return;
    try {
      setDbTemplates(await db.select("templates", "select=*&is_public=eq.true&order=usage_count.desc&limit=40"));
    } catch {
      /* marketplace falls back to the built-ins */
    }
  }, [db]);

  // Remote + local history is fetched when the studio opens and after each run.
  useEffect(() => {
    if (view !== "studio") return undefined;
    const timer = setTimeout(() => {
      loadRuns();
      loadPlan();
      loadTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, [view, loadRuns, loadPlan, loadTemplates]);

  // Stripe redirects land back here with query params. Handle them after paint
  // so the first render is not interrupted by state updates.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("purchase") === "success") {
        const id = params.get("template");
        if (id) setPurchased((prev) => [...new Set([...prev, id])]);
        // Drop the Stripe query string but keep the hash route intact.
        window.history.replaceState({}, "", `${window.location.pathname}#/market`);
        toast.success("Purchase confirmed");
      } else if (params.get("upgraded") === "true") {
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash || "#/swarm"}`);
        loadPlan();
        toast.info("Checking your subscription…");
      } else {
        return;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPlan, openTab, toast]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  /* ── keyboard ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === "Escape" && swarm.isRunning) {
        swarm.abort();
        toast.warn("Swarm stopped");
      }
      if (/^[1-9]$/.test(e.key) && !typing && !e.metaKey && !e.ctrlKey && view === "studio") {
        const next = TAB_ORDER[Number(e.key) - 1];
        if (next) openTab(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTab, swarm, toast, view]);

  /* ── actions ─────────────────────────────────────────────────────────── */
  const exportAllData = useCallback(() => {
    downloadText(
      `neural-swarm-export-${Date.now()}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          settings: { ...settings, anthropicKey: "", geminiKey: "", supabaseKey: "" },
          runs: readStored(STORAGE.runs, []),
          vault,
          memory,
          customAgents,
          workspace: workspace.files,
          usage,
        },
        null,
        2,
      ),
      "application/json",
    );
    toast.success("Export written to your downloads folder");
  }, [customAgents, memory, settings, toast, usage, vault, workspace.files]);

  const clearLocalData = useCallback(() => {
    Object.values(STORAGE).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    setVault([]);
    setMemory(DEFAULT_MEMORY);
    setRuns([]);
    setUsage({ count: 0, month: currentMonth() });
    setCustomAgents([]);
    workspace.clearAll();
    setSettings(DEFAULT_SETTINGS);
    toast.success("Local data cleared");
  }, [toast, workspace]);

  const useTemplate = useCallback(
    async (template) => {
      const g = template.goal || "";
      setGoal(g);
      openTab("swarm");
      if (Number(template.price) > 0 && !purchased.includes(template.id)) {
        try {
          if (!settings.supabaseUrl) throw new Error("Set your Supabase URL in Settings to enable purchases.");
          const res = await fetch(`${settings.supabaseUrl.replace(/\/+$/, "")}/functions/v1/stripe-checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ templateId: template.id }),
          });
          const ct = res.headers.get("content-type") || "";
          if (!ct.includes("json")) throw new Error(`stripe-checkout is not deployed (HTTP ${res.status})`);
          const data = await res.json();
          if (data.already_purchased) {
            setPurchased((prev) => [...new Set([...prev, template.id])]);
            toast.success("Already purchased — template unlocked");
            return;
          }
          if (data.error) throw new Error(data.error);
          if (data.url) window.location.href = data.url;
        } catch (err) {
          toast.error(err.message);
        }
        return;
      }
      if (template.agents?.length) {
        await swarm.run(g, { ...settings.runOptions, fixedAgents: template.agents.map((name) => ({ name, instruction: `Fulfil your ${name} role for this workflow.` })) });
      } else {
        toast.success(`Loaded “${template.name}” into the studio`);
      }
    },
    [jwt, openTab, purchased, settings, swarm, toast],
  );

  const publishTemplate = useCallback(
    async ({ name, desc, cat, price, tags }) => {
      const saved = { id: uid("t"), name, description: desc, goal_template: goal, cat, price, tags, usage_count: 0, color: "var(--accent-cyan)" };
      setDbTemplates((prev) => [saved, ...prev]);
      if (db) {
        try {
          await db.insert("templates", { name, description: desc, goal_template: goal, agent_flow: [], tags, category: cat, price, is_public: true, creator_email: session?.email || null });
          await loadTemplates();
        } catch (err) {
          toast.warn(`Published locally — Supabase rejected it: ${err.message}`);
        }
      }
      toast.success(`“${name}” published`);
    },
    [db, goal, loadTemplates, session, toast],
  );

  const templates = useMemo(
    () => [
      ...BUILTIN_TEMPLATES,
      ...dbTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        desc: t.description,
        goal: t.goal_template,
        tags: t.tags || [],
        cat: t.category || "Other",
        color: "var(--accent-cyan)",
        price: Number(t.price) || 0,
        usage: t.usage_count || 0,
        rating: t.rating_count ? (t.rating_sum / t.rating_count).toFixed(1) : null,
        creator: t.creator_email,
        agents: t.agent_flow?.length ? t.agent_flow : undefined,
      })),
    ],
    [dbTemplates],
  );

  const counts = useMemo(
    () => ({ files: workspace.stats.count, vault: vault.length, history: runs.length, market: templates.length }),
    [runs.length, templates.length, vault.length, workspace.stats.count],
  );

  const runNow = useCallback(() => {
    if (isGated) {
      setUpgradeOpen(true);
      return;
    }
    if (!goal.trim()) {
      setGoal(SAMPLE_GOAL);
      openTab("swarm");
      toast.info("Loaded a sample goal — press Launch when you are ready.");
      return;
    }
    openTab("swarm");
    toast.info("Press Launch in the studio to start the run.");
  }, [goal, isGated, openTab, toast]);

  const themeToggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  /* ── landing ─────────────────────────────────────────────────────────── */
  if (view === "landing") {
    return (
      <>
        <NeuralBackground phase="idle" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Landing
            theme={theme}
            onToggleTheme={themeToggle}
            onStart={(wanted) => {
              openTab("swarm");
              if (wanted && wanted !== "free") setUpgradeOpen(true);
            }}
            onStartWithGoal={(preset) => {
              setGoal(preset);
              openTab("swarm");
            }}
            onSignIn={() => setAuthOpen(true)}
            onOpenDocs={() => setDocsOpen(true)}
          />
        </div>

        {docsOpen ? (
          <DocsModal
            onClose={() => setDocsOpen(false)}
            onStart={() => {
              setDocsOpen(false);
              openTab("swarm");
            }}
          />
        ) : null}

        {authOpen ? (
          <AuthModal
            supabase={{ url: settings.supabaseUrl, key: settings.supabaseKey }}
            onClose={() => setAuthOpen(false)}
            onSession={(s) => {
              setSession(s);
              setAuthOpen(false);
            }}
            onLocal={(s) => {
              setSession({ ...s, local: true });
              setAuthOpen(false);
              toast.info("Local profile active — runs stay in this browser");
            }}
          />
        ) : null}

        {upgradeOpen ? (
          <UpgradeModal
            used={usage.count}
            limit={FREE_LIMIT}
            plan={plan}
            supabase={{ url: settings.supabaseUrl }}
            jwt={jwt}
            onClose={() => setUpgradeOpen(false)}
            onDemoUnlock={() => {
              setDemoUnlocked(true);
              setUpgradeOpen(false);
              toast.success("Pro unlocked for this session (demo)");
            }}
          />
        ) : null}
      </>
    );
  }

  /* ── studio ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <NeuralBackground agOut={swarm.outputs} phase={swarm.phase} />
      <Shell
        tab={tab}
        openTab={openTab}
        params={params}
        goBack={goBack}
        theme={theme}
        onToggleTheme={themeToggle}
        swarm={swarm}
        plan={plan}
        isGated={isGated}
        onUpgrade={() => setUpgradeOpen(true)}
        session={session}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={() => {
          setSession(null);
          toast.info("Signed out — local mode active");
        }}
        settings={settings}
        updateSettings={updateSettings}
        customAgents={customAgents}
        setCustomAgents={setCustomAgents}
        counts={counts}
        onClearLocal={clearLocalData}
        onExportAll={exportAllData}
        onHome={() => goHome()}
        runNow={runNow}
        search={{ files: workspace.files, runs, vault, templates }}
      >
        {tab === "swarm" ? (
          <SwarmView
            swarm={swarm}
            settings={settings}
            updateSettings={updateSettings}
            customAgents={customAgents}
            taste={memory}
            onFeedback={handleFeedback}
            goal={goal}
            setGoal={setGoal}
            isGated={isGated}
            onUpgrade={() => setUpgradeOpen(true)}
            onOpenTab={openTab}
            onSaveTemplate={() => setPublishOpen(true)}
            planLimit={plan === "free" ? 4 : 10}
          />
        ) : null}
        {tab === "preview" ? <PreviewStudio swarm={swarm} goal={goal} onOpenTab={openTab} routeDevice={params.device} /> : null}
        {tab === "files" ? <Workspace key={params.path || "files"} {...workspace} onOpenTab={openTab} routePath={params.path} /> : null}
        {tab === "terminal" ? <Terminal swarm={swarm} settings={settings} workspace={workspace} goal={goal} onOpenTab={openTab} /> : null}
        {tab === "canvas" ? <Canvas goal={goal} swarm={swarm} onOpenTab={openTab} isGated={isGated} onUpgrade={() => setUpgradeOpen(true)} /> : null}
        {tab === "security" ? (
          <SecurityDesk
            settings={settings}
            isGated={isGated}
            onUpgrade={() => setUpgradeOpen(true)}
            onSaveVault={(title, content, tag) => setVault((v) => [{ id: uid("v"), title, content, tag, created_at: new Date().toISOString() }, ...v])}
            setGoal={setGoal}
            onOpenTab={openTab}
          />
        ) : null}
        {tab === "research" ? (
          <Research
            settings={settings}
            isGated={isGated}
            onUpgrade={() => setUpgradeOpen(true)}
            onSaveVault={(title, content, tag) => setVault((v) => [{ id: uid("v"), title, content, tag, created_at: new Date().toISOString() }, ...v])}
            onInjectGoal={(g) => {
              setGoal(g);
              openTab("swarm");
            }}
          />
        ) : null}
        {tab === "vault" ? (
          <Vault
            key={params.item || "vault"}
            focusItem={params.item}
            items={vault}
            setItems={setVault}
            onInjectGoal={(content) => setGoal((g) => (g ? `${g}\n\n[VAULT CONTEXT]:\n${content}` : content))}
            onOpenTab={openTab}
          />
        ) : null}
        {tab === "market" ? (
          <Marketplace
            key={params.template || "market"}
            focusTemplate={params.template}
            templates={templates}
            purchased={new Set(purchased)}
            settings={settings}
            goal={goal}
            canPublish={Boolean(swarm.overseer)}
            onUse={useTemplate}
            onFork={(t) => {
              setGoal(t.goal || "");
              openTab("swarm");
              toast.info(`Forked “${t.name}” into the studio`);
            }}
            onPublish={() => setPublishOpen(true)}
            onOpenTab={openTab}
          />
        ) : null}
        {tab === "history" ? (
          <History
            key={params.run || "history"}
            focusRun={params.run}
            runs={runs}
            loading={runsLoading}
            sbReady={Boolean(db)}
            onRefresh={loadRuns}
            onOpenTab={openTab}
            onRestore={(run) => {
              setGoal(run.goal || "");
              openTab("swarm");
              toast.info("Run restored into the studio");
            }}
            onBranch={(run) => {
              setGoal(run.goal || "");
              openTab("swarm");
              toast.info("Branched — tweak the goal and launch");
            }}
            onDelete={async (run) => {
              setRuns((prev) => prev.filter((r) => r.id !== run.id));
              writeStored(STORAGE.runs, readStored(STORAGE.runs, []).filter((r) => r.id !== run.id));
              if (db) await db.remove("agent_runs", run.id).catch(() => {});
              toast.success("Run deleted");
            }}
            onToggleStar={(run) => {
              setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, starred: !r.starred } : r)));
              writeStored(STORAGE.runs, readStored(STORAGE.runs, []).map((r) => (r.id === run.id ? { ...r, starred: !r.starred } : r)));
            }}
          />
        ) : null}
        {tab === "insights" ? <Insights runs={runs} plan={plan} onOpenTab={openTab} /> : null}
        {tab === "brain" ? <Brain memory={memory} setMemory={setMemory} runCount={usage.count} /> : null}
      </Shell>

      <UpgradeModal
        open={upgradeOpen}
        used={usage.count}
        limit={FREE_LIMIT}
        plan={plan}
        supabase={{ url: settings.supabaseUrl }}
        jwt={jwt}
        onClose={() => setUpgradeOpen(false)}
        onDemoUnlock={() => {
          setDemoUnlocked(true);
          setUpgradeOpen(false);
          toast.success("Pro unlocked for this session (demo)");
        }}
      />

      {authOpen ? (
        <AuthModal
          supabase={{ url: settings.supabaseUrl, key: settings.supabaseKey }}
          onClose={() => setAuthOpen(false)}
          onSession={(s) => {
            setSession(s);
            setAuthOpen(false);
            loadPlan();
          }}
          onLocal={(s) => {
            setSession({ ...s, local: true });
            setAuthOpen(false);
          }}
        />
      ) : null}

      {publishOpen ? <PublishModal goal={goal} initialName={goal.slice(0, 40)} onClose={() => setPublishOpen(false)} onPublish={publishTemplate} /> : null}

      {docsOpen ? <DocsModal onClose={() => setDocsOpen(false)} /> : null}

      {onboarding ? (
        <Modal
          open
          onClose={() => {
            setOnboarding(false);
            writeStored(STORAGE.onboarded, true);
          }}
          title="Welcome to Neural Swarm"
          subtitle="Three things and you are productive"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setOnboarding(false);
                  writeStored(STORAGE.onboarded, true);
                }}
              >
                Explore first
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setOnboarding(false);
                  writeStored(STORAGE.onboarded, true);
                  setGoal(SAMPLE_GOAL);
                }}
              >
                Load a sample goal
              </Button>
            </>
          }
        >
          <div className="col gap-12">
            {[
              { icon: "key", t: "No key? No problem.", d: "Without credentials the studio runs an offline simulation engine so every view stays explorable. Add a key in Settings for real model output." },
              { icon: "swarm", t: "Describe an outcome, not a prompt.", d: "The planner picks two to five agents and gives each a concrete mandate: architecture, research, build, verification, review." },
              { icon: "folder", t: "Everything is exportable.", d: "Preview the result, extract files, download a ZIP, file the security report, or diff any two runs word-by-word." },
            ].map((s) => (
              <div key={s.t} className="row gap-12">
                <Icon name={s.icon} size={18} style={{ color: "var(--accent)", marginTop: 2 }} />
                <div>
                  <div className="strong small">{s.t}</div>
                  <div className="tiny muted mt-4">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function DocsModal({ onClose, onStart }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Docs"
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {onStart ? (
            <Button variant="primary" icon="rocket" onClick={onStart}>
              Open the studio
            </Button>
          ) : null}
        </>
      }
    >
      <div className="col gap-16">
        <section>
          <div className="section-label">Quick start</div>
          <ol className="small muted" style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Open Settings and paste an Anthropic or Google AI key — or point at the Supabase proxy. Skip it to explore offline.</li>
            <li>Type the outcome you want in the Studio and press Launch (⌘↵ works too).</li>
            <li>Watch the plan, the agent rail and the Overseer score, then open Preview, Files or Terminal.</li>
          </ol>
        </section>
        <section>
          <div className="section-label">What each view is for</div>
          <div className="col gap-8 mt-8">
            {[
              ["Studio", "Compose the goal, review the plan, watch agents stream, read the scored verdict."],
              ["Preview", "Sandboxed render of generated HTML/CSS/JS with a live console."],
              ["Files", "Every code fence extracted into an editable tree; export as ZIP."],
              ["Terminal", "Run log plus /heal, /test, /review and /explain commands that can patch the workspace."],
              ["Canvas", "Drag agents into a topology and run that exact pipeline."],
              ["Security", "Recon → exploit trace → verdict, rated and exportable as a GitHub issue."],
              ["Research", "Question decomposition and a synthesis brief that names its own gaps."],
              ["Vault", "Reusable artefacts injectable into any future goal."],
              ["Marketplace", "Curated workflows plus a generator that designs one for you."],
              ["History", "Versioned runs with word-level diffing, restore and branching."],
              ["Insights", "Tokens, spend, score trend and agent utilisation with CSV export."],
              ["Memory", "The preference profile injected into every brief, tuned by feedback."],
            ].map(([k, v]) => (
              <div key={k} className="row gap-10">
                <span className="small strong" style={{ width: 116, flex: "none" }}>
                  {k}
                </span>
                <span className="tiny muted">{v}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="section-label">Guides</div>
          <div className="row gap-16 mt-8">
            <a href="./ai-agent-orchestration-tool.html">AI agent orchestration guide</a>
            <a href="./claude-multi-agent-tool.html">Claude multi-agent guide</a>
          </div>
        </section>
      </div>
    </Modal>
  );
}
