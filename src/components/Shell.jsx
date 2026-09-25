import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Drawer, Field, IconButton, Input, Modal, Select, Switch } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { MobileSheet, MobileTabBar } from "./MobileNav.jsx";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { NAV, NAV_ITEMS, TAB_LABELS } from "../lib/nav.js";
import { TAB_ORDER } from "../lib/router.js";
import { MODELS, PLAN_TOKENS, STORAGE } from "../lib/constants.js";
import { hasCreds, streamModel } from "../lib/api.js";
import { clearSession, isMac, readStored, writeStored } from "../lib/store.js";

const PHASE_LABEL = { idle: "idle", planning: "planning", running: "running", overseeing: "scoring", done: "complete", error: "failed", aborted: "stopped" };

/**
 * Application shell: navigation, top bar, search, settings, shortcuts.
 *
 * Desktop gets the rail. Phones get a five-slot tab bar (Studio, Preview,
 * Files, Terminal, More) plus a full-screen sheet holding the remaining eight
 * views, recent runs and account actions — nothing is hidden behind a
 * horizontally scrolling strip any more.
 */
export default function Shell({
  tab,
  openTab,
  params = {},
  goBack,
  theme,
  onToggleTheme,
  swarm,
  plan,
  isGated,
  onUpgrade,
  session,
  onSignIn,
  onSignOut,
  settings,
  updateSettings,
  customAgents = [],
  setCustomAgents,
  counts = {},
  onClearLocal,
  onExportAll,
  onHome,
  runNow,
  search = {},
  children,
}) {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => readStored(STORAGE.ui, {}).railCollapsed === true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { files = [], runs = [], vault = [], templates = [] } = search;

  const commands = useMemo(() => {
    const views = NAV_ITEMS.map((n) => ({
      id: `go:${n.id}`,
      group: "Views",
      label: n.label,
      hint: n.blurb,
      icon: n.icon,
      keywords: [n.id, "go", "open", "view"],
      run: () => openTab(n.id),
    }));

    const actions = [
      { id: "act:run", label: "Launch the swarm on the current goal", hint: "Runs the plan in the studio", icon: "play", keywords: ["run", "start", "go", "launch"], run: runNow },
      { id: "act:stop", label: "Stop the running swarm", hint: "Aborts after the current token", icon: "stop", keywords: ["stop", "abort", "cancel"], run: () => swarm.abort() },
      { id: "act:settings", label: "Open settings", hint: "Keys, proxy, Supabase, custom agents", icon: "settings", keywords: ["settings", "key", "api", "supabase", "theme", "custom agents"], run: () => setSettingsOpen(true) },
      { id: "act:theme", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, icon: theme === "dark" ? "sun" : "moon", keywords: ["theme", "dark", "light"], run: onToggleTheme },
      { id: "act:shortcuts", label: "Keyboard shortcuts", icon: "key", keywords: ["keys", "shortcuts", "help"], run: () => setShortcutsOpen(true) },
      { id: "act:export", label: "Export all local data as JSON", hint: "Runs, files, vault, flows, memory", icon: "download", keywords: ["export", "backup", "json", "download"], run: onExportAll },
      { id: "act:home", label: "Back to the landing page", icon: "arrowRight", keywords: ["home", "landing", "marketing"], run: onHome },
    ].map((a) => ({ group: "Actions", ...a }));

    const fileItems = files.slice(0, 200).map((f) => ({
      id: `file:${f.path}`,
      group: "Files",
      label: f.path,
      hint: `${(f.code || "").split("\n").length} lines · ${f.agent || "agent"}`,
      icon: "file",
      keywords: [f.lang, "file", "code"],
      run: () => openTab("files", { path: f.path }),
    }));

    const runItems = runs.slice(0, 40).map((run) => ({
      id: `run:${run.id}`,
      group: "Runs",
      label: (run.goal || "Untitled run").slice(0, 90),
      hint: [run.score ? `★ ${run.score}` : null, run.branch ? `⎇ ${run.branch}` : null, run.created_at ? new Date(run.created_at).toLocaleDateString() : null].filter(Boolean).join(" · "),
      icon: "history",
      keywords: ["run", "history", "restore"],
      run: () => openTab("history", { run: run.id }),
    }));

    const vaultItems = vault.map((item) => ({
      id: `vault:${item.id}`,
      group: "Vault",
      label: item.title || "Untitled note",
      hint: `${item.tag || "note"} · ${String(item.content || "").slice(0, 60)}`,
      icon: "book",
      keywords: [item.tag, "vault", "note"],
      run: () => openTab("vault", { item: item.id }),
    }));

    const templateItems = templates.slice(0, 60).map((t) => ({
      id: `tpl:${t.id}`,
      group: "Templates",
      label: t.name,
      hint: `${t.cat || "Workflow"} · ${t.desc || ""}`.slice(0, 80),
      icon: "cart",
      keywords: [t.cat, ...(t.tags || []), "template", "marketplace"],
      run: () => openTab("market", { template: t.id }),
    }));

    return [...views, ...actions, ...fileItems, ...runItems, ...vaultItems, ...templateItems];
  }, [files, onExportAll, onHome, onToggleTheme, openTab, runs, runNow, swarm, templates, theme, vault]);

  const recents = useMemo(
    () =>
      runs.slice(0, 3).map((run) => ({
        id: `recent:${run.id}`,
        group: "Recent",
        label: (run.goal || "Untitled run").slice(0, 80),
        hint: run.created_at ? `last opened ${new Date(run.created_at).toLocaleDateString()}` : "saved run",
        icon: "clock",
        run: () => openTab("history", { run: run.id }),
      })),
    [openTab, runs],
  );

  useEffect(() => {
    const onKey = (e) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "?" && !/input|textarea/i.test(e.target.tagName)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
      if (e.key === "/" && !/input|textarea/i.test(e.target.tagName)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleRail = useCallback((next) => {
    setCollapsed(next);
    const current = readStored(STORAGE.ui, {});
    writeStored(STORAGE.ui, { ...current, railCollapsed: next });
  }, []);

  // A new view starts at the top — otherwise switching tabs lands mid-page.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tab]);

  const openSearch = useCallback(() => setPaletteOpen(true), []);

  /**
   * Swipe left/right between views on touch devices. Deliberately conservative:
   * a gesture must be mostly horizontal, and never starts inside an editor,
   * the terminal input, the flow canvas, a segmented control or the iframe.
   */
  const swipe = useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest?.("input, textarea, select, .canvas-wrap, .segmented, iframe, [data-no-swipe], .sheet, .palette")) {
      swipe.current = null;
      return;
    }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Date.now() - start.t > 700) return;
    if (Math.abs(dx) < 68 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const index = TAB_ORDER.indexOf(tab);
    if (index === -1) return;
    const next = TAB_ORDER[index + (dx < 0 ? 1 : -1)];
    if (next) openTab(next);
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#view">
        Skip to content
      </a>

      {!isMobile ? (
        <aside className={`rail ${collapsed ? "collapsed" : ""}`}>
          <div className="rail-head row between gap-8" style={{ padding: "14px 12px" }}>
            <button className="row gap-8" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }} onClick={onHome} title="Back to landing page">
              <span className="dot" style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
              {!collapsed ? (
                <span className="strong">
                  Neural<span style={{ color: "var(--accent)" }}>Swarm</span>
                </span>
              ) : null}
            </button>
            {!collapsed ? <IconButton name="chevronLeft" label="Collapse navigation" size={14} onClick={() => toggleRail(true)} /> : null}
          </div>

          {!collapsed ? (
            <button className="rail-search" onClick={openSearch}>
              <Icon name="search" size={13} />
              <span className="grow truncate">Search</span>
              <span className="kbd">{isMac() ? "⌘" : "Ctrl"}</span>
              <span className="kbd">K</span>
            </button>
          ) : null}

          <nav className="rail-nav">
            {collapsed ? <IconButton name="chevronRight" label="Expand navigation" size={14} onClick={() => toggleRail(false)} /> : null}
            {NAV.map((group) => (
              <div key={group.group}>
                <div className="rail-group">{group.group}</div>
                {group.items.map((item) => {
                  const count = counts[item.id];
                  return (
                    <button key={item.id} className="rail-link" aria-current={tab === item.id ? "page" : undefined} onClick={() => openTab(item.id)} title={item.label}>
                      <span className="rail-icon">
                        <Icon name={item.icon} size={15} />
                      </span>
                      <span className="rail-label">{item.label}</span>
                      {count ? <span className="rail-badge badge">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="rail-foot" style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
            {!collapsed ? (
              <div className="col gap-8">
                <div className="row between">
                  <span className="dimmer tiny">{plan.toUpperCase()} plan</span>
                  {isGated ? (
                    <Button size="sm" variant="primary" onClick={onUpgrade}>
                      Upgrade
                    </Button>
                  ) : null}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => setSettingsOpen(true)}>
                  <Icon name="settings" size={13} /> Settings
                </button>
                <button className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => setShortcutsOpen(true)}>
                  <Icon name="key" size={13} /> Shortcuts
                </button>
              </div>
            ) : (
              <div className="col gap-6 center">
                <IconButton name="settings" label="Settings" onClick={() => setSettingsOpen(true)} />
                <IconButton name="search" label="Search" onClick={openSearch} />
              </div>
            )}
          </div>
        </aside>
      ) : null}

      <div className="main">
        <header className="topbar">
          {isMobile ? (
            <>
              <span className="row gap-8 grow" style={{ minWidth: 0 }}>
                <span className="dot" style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
                <span className="col" style={{ minWidth: 0 }}>
                  <span className="strong small truncate">{TAB_LABELS[tab] || "Neural Swarm"}</span>
                  <span className="dimmer tiny truncate">
                    {swarm.isRunning ? `${PHASE_LABEL[swarm.phase] || swarm.phase} · ${swarm.progress}%` : "Neural Swarm studio"}
                  </span>
                </span>
              </span>
              <div className="row gap-6">
                <IconButton name="search" label="Search" onClick={openSearch} />
                <IconButton name={theme === "dark" ? "sun" : "moon"} label="Toggle theme" onClick={onToggleTheme} />
                <IconButton name="settings" label="Settings" onClick={() => setSettingsOpen(true)} />
              </div>
            </>
          ) : (
            <>
              <IconButton name="menu" label="Command palette" onClick={openSearch} className="btn-ghost" />
              <button className="row gap-8 grow topbar-search" onClick={openSearch}>
                <Icon name="search" size={14} />
                <span className="small truncate">Search files, runs, notes or jump to a view…</span>
                <span className="row gap-2 dimmer tiny nowrap">
                  <span className="kbd">{isMac() ? "⌘" : "Ctrl"}</span>
                  <span className="kbd">K</span>
                </span>
              </button>
              <div className="row gap-8">
                {swarm.isRunning ? (
                  <Badge tone="default">
                    <span className="dot pulse" style={{ background: "var(--accent-cyan)" }} />
                    {PHASE_LABEL[swarm.phase] || swarm.phase} · {swarm.progress}%
                  </Badge>
                ) : swarm.phase === "done" ? (
                  <Badge tone="accent" icon="check">
                    last run complete
                  </Badge>
                ) : null}
                <IconButton name={theme === "dark" ? "sun" : "moon"} label="Toggle theme" onClick={onToggleTheme} />
                {session ? (
                  <button className="btn btn-ghost btn-sm" onClick={onSignOut} title="Sign out">
                    <Icon name="user" size={13} />
                    <span className="truncate" style={{ maxWidth: 120 }}>
                      {session.email}
                    </span>
                  </button>
                ) : (
                  <Button size="sm" icon="user" onClick={onSignIn}>
                    Sign in
                  </Button>
                )}
              </div>
            </>
          )}
        </header>

        {!isMobile ? (
          <div className="crumbs">
            {goBack ? (
              <button onClick={goBack} className="crumb-back" title="Back">
                <Icon name="chevronLeft" size={12} /> Back
              </button>
            ) : null}
            <button onClick={onHome}>Home</button>
            <span>/</span>
            <span className="strong" style={{ color: "var(--text-2)" }}>
              {TAB_LABELS[tab] || "Studio"}
            </span>
            {params.path || params.run || params.item || params.template ? <span>/</span> : null}
            {params.path ? <span className="mono truncate" style={{ maxWidth: 340 }}>{params.path}</span> : null}
            {params.run ? <span className="truncate" style={{ maxWidth: 340 }}>a saved run</span> : null}
            {params.item ? <span className="truncate" style={{ maxWidth: 340 }}>a vault note</span> : null}
            {params.template ? <span className="truncate" style={{ maxWidth: 340 }}>a template</span> : null}
            <span className="grow" />
          </div>
        ) : null}

        <main className="view" id="view" onTouchStart={isMobile ? onTouchStart : undefined} onTouchEnd={isMobile ? onTouchEnd : undefined}>
          {children}
        </main>
      </div>

      {isMobile ? (
        <>
          <MobileTabBar
            tab={tab}
            onSelect={openTab}
            onMore={() => setSheetOpen((o) => !o)}
            sheetOpen={sheetOpen}
            counts={counts}
            running={swarm.isRunning}
            progress={swarm.progress}
          />
          <MobileSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            tab={tab}
            onSelect={openTab}
            onSearch={openSearch}
            counts={counts}
            runs={runs}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onSettings={() => setSettingsOpen(true)}
            onShortcuts={() => setShortcutsOpen(true)}
            onHome={onHome}
            session={session}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            isGated={isGated}
            onUpgrade={onUpgrade}
          />
        </>
      ) : null}

      {paletteOpen ? <CommandPalette commands={commands} recents={recents} onClose={() => setPaletteOpen(false)} /> : null}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
        customAgents={customAgents}
        setCustomAgents={setCustomAgents}
        onClearLocal={onClearLocal}
        onExportAll={onExportAll}
        toast={toast}
      />
      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
        <div className="col gap-8">
          {[
            [isMac() ? "⌘ K" : "Ctrl K", "Open search and commands"],
            ["/", "Same as above, one key"],
            [isMac() ? "⌘ ↵" : "Ctrl ↵", "Launch the current goal"],
            ["Esc", "Stop the running swarm / close overlays"],
            ["?", "This list"],
            ["1 – 9", "Jump between the first nine views"],
            ...(isMobile ? [["Swipe ← →", "Move between views on a phone"]] : []),
          ].map(([k, v]) => (
            <div key={k} className="row between gap-12">
              <span className="small muted">{v}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function SettingsDrawer({ open, onClose, settings, updateSettings, customAgents = [], setCustomAgents, onClearLocal, onExportAll, toast }) {
  const [reveal, setReveal] = useState({});
  const [testing, setTesting] = useState(false);
  const [draft, setDraft] = useState({ name: "", i: "🤖", c: "#22d3ee", sys: "" });

  const test = async () => {
    setTesting(true);
    try {
      if (!hasCreds(settings)) throw new Error("Add a key or a proxy URL first.");
      const res = await streamModel({ settings, system: "Reply with the single word: ready.", messages: [{ role: "user", content: "ping" }], maxTokens: 24 });
      toast.success(`Model replied: “${res.text.trim().slice(0, 40)}”${res.simulated ? " (simulated)" : ""}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const addAgent = () => {
    const name = draft.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!name) return toast.warn("Give the agent a name.");
    if (!draft.sys.trim()) return toast.warn("Add a system prompt — that is what the agent is.");
    if (customAgents.some((a) => a.name === name)) return toast.warn(`${name} already exists.`);
    setCustomAgents((prev) => [...prev, { name, icon: draft.i.slice(0, 2) || "⬡", color: draft.c, sys: draft.sys }]);
    setDraft({ name: "", i: "🤖", c: "#22d3ee", sys: "" });
    toast.success(`${name} joined the swarm`);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Settings">
      <div className="col gap-18">
        <section className="col gap-10">
          <div className="row between">
            <span className="strong small">Model connection</span>
            <Badge tone={hasCreds(settings) ? "accent" : "warn"}>{hasCreds(settings) ? "live" : "offline simulation"}</Badge>
          </div>
          <Field label="Model" hint="Claude models stream natively; Gemini models stream through the same layer.">
            <Select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })} options={MODELS.map((m) => ({ value: m.id, label: m.label }))} />
          </Field>
          <Field label="Anthropic key" hint="Stored in sessionStorage unless you tick “remember on this device”.">
            <div className="row gap-6">
              <Input
                type={reveal.anthropicKey ? "text" : "password"}
                value={settings.anthropicKey}
                placeholder="sk-ant-…"
                onChange={(e) => updateSettings({ anthropicKey: e.target.value })}
              />
              <IconButton name={reveal.anthropicKey ? "eye" : "lock"} label="Reveal" onClick={() => setReveal((r) => ({ ...r, anthropicKey: !r.anthropicKey }))} />
            </div>
          </Field>
          <Field label="Gemini key" hint="Optional — used when the selected model is a Gemini one.">
            <div className="row gap-6">
              <Input
                type={reveal.geminiKey ? "text" : "password"}
                value={settings.geminiKey}
                placeholder="AIza…"
                onChange={(e) => updateSettings({ geminiKey: e.target.value })}
              />
              <IconButton name={reveal.geminiKey ? "eye" : "lock"} label="Reveal" onClick={() => setReveal((r) => ({ ...r, geminiKey: !r.geminiKey }))} />
            </div>
          </Field>
          <Field label="Proxy URL" hint="Optional. Point this at your own Supabase edge function to route through a server key.">
            <Input value={settings.proxyUrl} placeholder="https://<project>.supabase.co/functions/v1/swarm-proxy" onChange={(e) => updateSettings({ proxyUrl: e.target.value })} />
          </Field>
          <div className="row gap-8 wrap">
            <Button size="sm" icon="zap" onClick={test} disabled={testing}>
              {testing ? "Pinging…" : "Test connection"}
            </Button>
            <Switch checked={settings.rememberKeys} onChange={(v) => updateSettings({ rememberKeys: v })} label="Remember keys on this device" />
          </div>
        </section>

        <section className="col gap-10">
          <span className="strong small">Defaults for new runs</span>
          <Field label="Max tokens per agent">
            <Select
              value={String(settings.maxTokens)}
              onChange={(e) => updateSettings({ maxTokens: Number(e.target.value) })}
              options={[
                { value: String(PLAN_TOKENS.free), label: `${PLAN_TOKENS.free} — quick draft` },
                { value: String(PLAN_TOKENS.pro), label: `${PLAN_TOKENS.pro} — standard` },
                { value: String(PLAN_TOKENS.power), label: `${PLAN_TOKENS.power} — deep build` },
              ]}
            />
          </Field>
          <Switch checked={settings.runOptions?.chainMode} onChange={(v) => updateSettings({ runOptions: { ...settings.runOptions, chainMode: v } })} label="Chain mode — each agent sees the previous output" />
          <Switch checked={settings.runOptions?.parallel} onChange={(v) => updateSettings({ runOptions: { ...settings.runOptions, parallel: v } })} label="Parallel execution" />
        </section>

        <section className="col gap-10">
          <span className="strong small">Custom agents</span>
          <p className="tiny muted">They join the planner, the canvas and the palette exactly like the built-in ten.</p>
          {customAgents.map((agent) => (
            <div key={agent.name} className="row between gap-8 inset" style={{ padding: "8px 10px" }}>
              <span className="row gap-8">
                <span>{agent.icon}</span>
                <span className="small strong">{agent.name}</span>
              </span>
              <IconButton name="trash" label={`Remove ${agent.name}`} size={13} onClick={() => setCustomAgents((prev) => prev.filter((a) => a.name !== agent.name))} />
            </div>
          ))}
          <Field label="Name">
            <Input value={draft.name} placeholder="AUDITOR" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </Field>
          <div className="row gap-8">
            <Field label="Icon" className="grow">
              <Input value={draft.i} maxLength={2} onChange={(e) => setDraft((d) => ({ ...d, i: e.target.value }))} />
            </Field>
            <Field label="Colour">
              <input type="color" value={draft.c} onChange={(e) => setDraft((d) => ({ ...d, c: e.target.value }))} aria-label="Colour" className="color-input" />
            </Field>
          </div>
          <Field label="System prompt">
            <Input value={draft.sys} placeholder="You audit changes for compliance…" onChange={(e) => setDraft((d) => ({ ...d, sys: e.target.value }))} />
          </Field>
          <Button size="sm" icon="plus" onClick={addAgent}>
            Add agent
          </Button>
        </section>

        <section className="col gap-10">
          <span className="strong small">Supabase (optional)</span>
          <Field label="Project URL">
            <Input value={settings.supabaseUrl} placeholder="https://<project>.supabase.co" onChange={(e) => updateSettings({ supabaseUrl: e.target.value })} />
          </Field>
          <Field label="Anon key">
            <Input type="password" value={settings.supabaseKey} placeholder="eyJ…" onChange={(e) => updateSettings({ supabaseKey: e.target.value })} />
          </Field>
          <p className="tiny muted">Without this, every view still works — history, files and memory just stay in this browser.</p>
        </section>

        <section className="col gap-10">
          <span className="strong small">Your data</span>
          <div className="row gap-8 wrap">
            <Button size="sm" icon="download" onClick={onExportAll}>
              Export everything
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon="trash"
              onClick={() => {
                onClearLocal();
                onClose();
              }}
            >
              Reset local data
            </Button>
          </div>
          <p className="tiny muted">Runs, files, flows, vault, memory and settings live in this browser’s storage. Export first if you want a copy.</p>
        </section>

        <section className="col gap-6">
          <span className="strong small">Storage in use</span>
          <StorageMeter />
        </section>

        <div className="dimmer tiny">Device: {isMac() ? "macOS" : "non-macOS"} · storage keys prefixed {STORAGE.settings.split(".")[0]}.*</div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            clearSession();
            toast.info("Session secrets cleared — a reload will ask again.");
          }}
        >
          <Icon name="lock" size={13} /> Clear session secrets
        </button>
      </div>
    </Drawer>
  );
}

function StorageMeter() {
  const used = useMemo(() => {
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key?.startsWith("ns.")) continue;
        bytes += (localStorage.getItem(key) || "").length + key.length;
      }
      return bytes;
    } catch {
      return 0;
    }
  }, []);
  const kb = used / 1024;
  const pct = Math.min(100, (used / (5 * 1024 * 1024)) * 100);
  return (
    <div className="col gap-4">
      <div className="meter">
        <span style={{ width: `${Math.max(pct, 1.5)}%` }} />
      </div>
      <span className="dimmer tiny">
        {kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`} of the ~5 MB a browser gives a site
      </span>
    </div>
  );
}
