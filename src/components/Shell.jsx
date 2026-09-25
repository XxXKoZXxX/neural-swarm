import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Drawer, Field, IconButton, Input, Modal, Select, Switch } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import { MODELS, PLAN_TOKENS, STORAGE } from "../lib/constants.js";
import { hasCreds, streamModel } from "../lib/api.js";
import { clearSession, isMac, readStored } from "../lib/store.js";

const NAV = [
  { group: "Build", items: [
    { id: "swarm", label: "Studio", icon: "swarm" },
    { id: "preview", label: "Preview", icon: "play" },
    { id: "files", label: "Files", icon: "folder" },
    { id: "terminal", label: "Terminal", icon: "terminal" },
    { id: "canvas", label: "Canvas", icon: "flow" },
  ] },
  { group: "Research", items: [
    { id: "security", label: "Security", icon: "shield" },
    { id: "research", label: "Research", icon: "search" },
    { id: "vault", label: "Vault", icon: "book" },
  ] },
  { group: "Manage", items: [
    { id: "market", label: "Marketplace", icon: "cart" },
    { id: "history", label: "History", icon: "history" },
    { id: "insights", label: "Insights", icon: "chart" },
    { id: "brain", label: "Memory", icon: "brain" },
  ] },
];

const PHASE_LABEL = { idle: "idle", planning: "planning", running: "running", overseeing: "scoring", done: "complete", error: "failed", aborted: "stopped" };

/** Application shell: navigation rail, top bar, settings, palette, shortcuts. */
export default function Shell({
  tab,
  setTab,
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
  children,
}) {
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const flatNav = useMemo(() => NAV.flatMap((g) => g.items), []);
  const commands = useMemo(
    () => [
      ...flatNav.map((n) => ({ id: `go:${n.id}`, label: `Go to ${n.label}`, icon: n.icon, run: () => setTab(n.id) })),
      { id: "act:run", label: "Launch the current goal", icon: "play", run: runNow },
      { id: "act:stop", label: "Stop the running swarm", icon: "stop", run: () => swarm.abort() },
      { id: "act:settings", label: "Open settings", icon: "settings", run: () => setSettingsOpen(true) },
      { id: "act:theme", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, icon: theme === "dark" ? "sun" : "moon", run: onToggleTheme },
      { id: "act:home", label: "Back to the landing page", icon: "arrowRight", run: onHome },
      { id: "act:shortcuts", label: "Keyboard shortcuts", icon: "key", run: () => setShortcutsOpen(true) },
      { id: "act:export", label: "Export all local data as JSON", icon: "download", run: onExportAll },
    ],
    [flatNav, onExportAll, onHome, onToggleTheme, runNow, setTab, swarm, theme],
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
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
          {!collapsed ? <IconButton name="chevronLeft" label="Collapse navigation" size={14} onClick={() => setCollapsed(true)} /> : null}
        </div>

        <nav className="rail-nav">
          {collapsed ? <IconButton name="chevronRight" label="Expand navigation" size={14} onClick={() => setCollapsed(false)} /> : null}
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="rail-group">{group.group}</div>
              {group.items.map((item) => {
                const count = counts[item.id];
                return (
                  <button key={item.id} className="rail-link" aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)} title={item.label}>
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
            <IconButton name="settings" label="Settings" onClick={() => setSettingsOpen(true)} />
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <IconButton name="menu" label="Command palette" onClick={() => setPaletteOpen(true)} className="btn-ghost" />
          <button className="row gap-8 grow" style={{ background: "none", border: 0, color: "var(--text-3)", cursor: "pointer", textAlign: "left", minWidth: 0 }} onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={14} />
            <span className="small truncate">Search or jump to… </span>
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
            <span className="dimmer tiny mono nowrap" style={{ display: "none" }}>
              ~{swarm.tokens} tok
            </span>
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
        </header>

        <main className="view">{children}</main>
      </div>

      {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} commands={commands} /> : null}
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
            [isMac() ? "⌘ K" : "Ctrl K", "Open the command palette"],
            [isMac() ? "⌘ ↵" : "Ctrl ↵", "Launch the current goal"],
            ["Esc", "Stop the running swarm / close overlays"],
            ["?", "This list"],
            ["1 – 9", "Jump between views"],
          ].map(([k, v]) => (
            <div key={k} className="row between">
              <span className="small muted">{v}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** Mounted only while open, so each invocation starts from a clean slate. */
function CommandPalette({ onClose, commands }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="overlay" style={{ alignItems: "flex-start" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="Type a command or view name…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === "Enter" && results[active]) {
              results[active].run();
              onClose();
            }
            if (e.key === "Escape") onClose();
          }}
          aria-label="Command input"
        />
        <div className="palette-list">
          {results.length === 0 ? <div className="dim small" style={{ padding: 14 }}>No command matches “{query}”.</div> : null}
          {results.map((c, i) => (
            <button key={c.id} className="palette-item" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => { c.run(); onClose(); }}>
              <Icon name={c.icon} size={14} />
              <span className="grow">{c.label}</span>
              {i === active ? <span className="kbd">↵</span> : null}
            </button>
          ))}
        </div>
      </div>
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

  const secret = (key, label, placeholder, hint) => (
    <Field label={label} hint={hint}>
      <div className="row gap-6">
        <Input
          type={reveal[key] ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={settings[key]}
          placeholder={placeholder}
          onChange={(e) => updateSettings({ [key]: e.target.value })}
        />
        <IconButton name="eye" label={reveal[key] ? "Hide" : "Reveal"} onClick={() => setReveal((r) => ({ ...r, [key]: !r[key] }))} />
      </div>
    </Field>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <div className="row gap-8">
          <Button variant="primary" icon="zap" onClick={test} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button variant="ghost" icon="download" onClick={onExportAll}>
            Export data
          </Button>
          <span className="grow" />
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="col gap-20">
        <section className="col gap-12">
          <div className="section-label">Model access</div>
          <p className="tiny muted">
            Keys stay in {settings.rememberKeys ? "this browser's local storage" : "session storage for this tab"} and are sent only to your configured endpoint. Prefer the proxy for shared machines —
            then no key ever reaches the client.
          </p>
          {secret("anthropicKey", "Anthropic API key", "sk-ant-…", "Only needed for direct browser calls.")}
          {secret("geminiKey", "Google AI key", "AIza…", "Enables the Gemini models.")}
          <Field label="Proxy URL" hint="Supabase edge function that holds the key server-side.">
            <Input value={settings.proxyUrl} onChange={(e) => updateSettings({ proxyUrl: e.target.value })} placeholder="https://xyz.supabase.co/functions/v1/swarm-proxy" />
          </Field>
          <Switch
            checked={settings.rememberKeys}
            onChange={(v) => {
              updateSettings({ rememberKeys: v });
              if (!v) clearSession("ns.secrets");
              toast.info(v ? "Keys will persist on this device" : "Keys are kept for this tab only");
            }}
            label="Remember keys on this device"
          />
        </section>

        <section className="col gap-12">
          <div className="section-label">Model defaults</div>
          <Field label="Default model">
            <Select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })} options={MODELS.map((m) => ({ value: m.id, label: `${m.label} — ${m.note}` }))} />
          </Field>
          <div className="grid-2">
            <Field label="Max tokens per agent">
              <Input type="number" min="200" max="8000" step="100" value={settings.maxTokens} onChange={(e) => updateSettings({ maxTokens: Number(e.target.value) || PLAN_TOKENS.free })} />
            </Field>
            <Field label="Temperature">
              <Input type="number" min="0" max="1" step="0.1" value={settings.temperature} onChange={(e) => updateSettings({ temperature: Number(e.target.value) })} />
            </Field>
          </div>
        </section>

        <section className="col gap-12">
          <div className="section-label">Supabase (optional)</div>
          <p className="tiny muted">Adds auth, synced run history, the template marketplace and Stripe checkout.</p>
          <Field label="Project URL">
            <Input value={settings.supabaseUrl} onChange={(e) => updateSettings({ supabaseUrl: e.target.value })} placeholder="https://xyz.supabase.co" />
          </Field>
          {secret("supabaseKey", "Anon key", "eyJ…")}
        </section>

        <section className="col gap-12">
          <div className="section-label">Custom agents</div>
          <p className="tiny muted">Add specialists that run alongside the ten built-ins — a legal reviewer, a brand voice editor, a domain expert.</p>
          {customAgents.map((a) => (
            <div key={a.name} className="row between inset" style={{ padding: "7px 9px" }}>
              <span className="row gap-8">
                <span>{a.i}</span>
                <span className="small strong mono">{a.name}</span>
              </span>
              <IconButton name="trash" label={`Remove ${a.name}`} size={12} onClick={() => setCustomAgents?.(customAgents.filter((x) => x.name !== a.name))} />
            </div>
          ))}
          <div className="grid-2">
            <Input
              placeholder="LEGAL_REVIEWER"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") }))}
            />
            <div className="row gap-6">
              <Input style={{ width: 60 }} value={draft.i} onChange={(e) => setDraft((d) => ({ ...d, i: e.target.value.slice(-2) || "⬡" }))} aria-label="Icon" />
              <input type="color" className="input" style={{ width: 44, padding: 2 }} value={draft.c} onChange={(e) => setDraft((d) => ({ ...d, c: e.target.value }))} aria-label="Colour" />
            </div>
          </div>
          <Input placeholder="System prompt: what this agent is responsible for…" value={draft.sys} onChange={(e) => setDraft((d) => ({ ...d, sys: e.target.value }))} />
          <Button
            icon="plus"
            onClick={() => {
              const name = draft.name.trim();
              if (!name || !draft.sys.trim()) return toast.warn("Give the agent a name and a system prompt.");
              if (customAgents.some((a) => a.name === name)) return toast.warn(`${name} already exists.`);
              setCustomAgents?.([...customAgents, { ...draft, name }]);
              setDraft({ name: "", i: "🤖", c: "#22d3ee", sys: "" });
              toast.success(`${name} added to the swarm`);
            }}
          >
            Add agent
          </Button>
        </section>

        <section className="col gap-12">
          <div className="section-label">Integrations</div>
          <Field label="Webhook URL" hint="Receives a JSON payload when a run completes.">
            <Input value={settings.webhookUrl} onChange={(e) => updateSettings({ webhookUrl: e.target.value })} placeholder="https://hooks.slack.com/services/…" />
          </Field>
        </section>

        <section className="col gap-12">
          <div className="section-label">This device</div>
          <div className="row between">
            <span className="small muted">Stored data</span>
            <span className="tiny dim mono">
              runs {readStored(STORAGE.runs, []).length} · vault {readStored(STORAGE.vault, []).length} · files {readStored(STORAGE.workspace, []).length}
            </span>
          </div>
          <Button variant="danger" icon="trash" onClick={onClearLocal}>
            Clear all local data
          </Button>
          <p className="dimmer tiny">Clears runs, memory, vault, workspace and keys from this browser. Supabase data is untouched.</p>
        </section>
      </div>
    </Drawer>
  );
}
