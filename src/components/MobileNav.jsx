import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Badge, Button, IconButton } from "./ui.jsx";
import useInstallPrompt from "../hooks/useInstallPrompt.js";
import { useToast } from "../hooks/useToast.js";
import { NAV, NAV_ITEMS, PRIMARY_TABS, TAB_LABELS } from "../lib/nav.js";

/**
 * Phone navigation: a five-slot tab bar plus a full-screen "all views" sheet.
 *
 * The previous build squeezed all twelve destinations into one horizontally
 * scrolling strip, so half of them were off-screen with no affordance. Here
 * the bar holds the four places people actually work in, and everything else
 * lives one obvious tap away in a sheet that also carries search, recent runs
 * and account actions.
 */

export function MobileTabBar({ tab, onSelect, onMore, sheetOpen, counts = {}, running = false, progress = 0 }) {
  const overflowActive = !PRIMARY_TABS.includes(tab);

  return (
    <nav className="tabbar" aria-label="Primary">
      {running ? (
        <span className="tabbar-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(progress, 6)}%` }} />
        </span>
      ) : null}
      {PRIMARY_TABS.map((id) => {
        const item = NAV_ITEMS.find((n) => n.id === id);
        const count = counts[id];
        return (
          <button
            key={id}
            className="tabbar-btn"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => onSelect(id)}
          >
            <span className="tabbar-icon">
              <Icon name={item.icon} size={19} />
              {running && id === "swarm" ? <span className="tabbar-live" /> : null}
              {count ? <span className="tabbar-badge">{count > 99 ? "99+" : count}</span> : null}
            </span>
            <span className="tabbar-label">{item.label}</span>
          </button>
        );
      })}
      <button
        className="tabbar-btn"
        aria-current={overflowActive ? "page" : undefined}
        aria-expanded={sheetOpen}
        onClick={onMore}
      >
        <span className="tabbar-icon">
          <Icon name={overflowActive ? NAV_ITEMS.find((n) => n.id === tab)?.icon || "more" : "more"} size={19} />
        </span>
        <span className="tabbar-label">{overflowActive ? TAB_LABELS[tab] : "More"}</span>
      </button>
    </nav>
  );
}

export function MobileSheet({
  open,
  onClose,
  tab,
  onSelect,
  onSearch,
  counts = {},
  runs = [],
  theme,
  onToggleTheme,
  onSettings,
  onShortcuts,
  onHome,
  session,
  onSignIn,
  onSignOut,
  isGated,
  onUpgrade,
}) {
  const toast = useToast();
  const { canInstall, install, installed, isIosSafari } = useInstallPrompt();
  const [installHint, setInstallHint] = useState(false);
  const sheetRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep focus inside the sheet: a keyboard user should never tab into the
      // page behind the overlay.
      const focusable = sheetRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const timer = setTimeout(() => sheetRef.current?.querySelector("button")?.focus(), 40);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const go = (id, params) => {
    onSelect(id, params);
    onClose();
  };

  return (
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="All views" ref={sheetRef}>
        <header className="sheet-head">
          <span className="strong">Where to?</span>
          <span className="grow" />
          <IconButton name="close" label="Close navigation" onClick={onClose} />
        </header>

        <div className="sheet-body">
          <button className="sheet-search" onClick={onSearch}>
            <Icon name="search" size={16} />
            <span className="grow">Search files, runs, notes…</span>
            <span className="kbd">⌘K</span>
          </button>

          <div className="sheet-primary">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className="sheet-tile"
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <span className="sheet-tile-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="col" style={{ minWidth: 0 }}>
                  <span className="row gap-6">
                    <span className="strong small">{item.label}</span>
                    {counts[item.id] ? <Badge>{counts[item.id]}</Badge> : null}
                  </span>
                  <span className="dimmer tiny truncate">{item.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          {runs.length ? (
            <section className="sheet-section">
              <div className="sheet-section-title">
                <span>Recent runs</span>
                <button className="linklike tiny" onClick={() => go("history")}>
                  See all
                </button>
              </div>
              {runs.slice(0, 3).map((run) => (
                <button key={run.id} className="sheet-row" onClick={() => go("history", { run: run.id })}>
                  <Icon name="history" size={15} />
                  <span className="col grow" style={{ minWidth: 0 }}>
                    <span className="truncate small">{(run.goal || "Untitled run").slice(0, 72)}</span>
                    <span className="dimmer tiny">
                      {run.score ? `★ ${run.score} · ` : ""}
                      {run.agents ? `${Object.keys(run.agents).length} agents` : "saved run"}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={14} />
                </button>
              ))}
            </section>
          ) : null}

          <section className="sheet-section">
            <div className="sheet-section-title">
              <span>Session</span>
            </div>
            {isGated ? (
              <Button variant="primary" icon="bolt" className="w-full" onClick={() => { onUpgrade(); onClose(); }}>
                Upgrade for more runs
              </Button>
            ) : null}
            <div className="sheet-actions">
              {!installed && (canInstall || isIosSafari) ? (
                <button
                  className="sheet-row"
                  onClick={async () => {
                    if (canInstall) {
                      const outcome = await install();
                      if (outcome === "accepted") toast.success("Installed — open it from your home screen");
                      return;
                    }
                    setInstallHint((v) => !v);
                  }}
                >
                  <Icon name="download" size={15} />
                  <span className="grow">Install as an app</span>
                  <Icon name={installHint ? "chevronDown" : "chevronRight"} size={13} />
                </button>
              ) : null}
              {installHint ? (
                <p className="tiny muted" style={{ padding: "2px 12px 6px" }}>
                  On iPhone: tap the Share button in Safari, then <strong>Add to Home Screen</strong>. It opens full screen with no browser chrome.
                </p>
              ) : null}
              <button className="sheet-row" onClick={() => { onSearch(); onClose(); }}>
                <Icon name="search" size={15} /> <span className="grow">Search everything</span>
              </button>
              <button className="sheet-row" onClick={() => { onSettings(); onClose(); }}>
                <Icon name="settings" size={15} /> <span className="grow">Settings &amp; API keys</span>
              </button>
              <button className="sheet-row" onClick={() => { onToggleTheme(); }}>
                <Icon name={theme === "dark" ? "sun" : "moon"} size={15} /> <span className="grow">Switch to {theme === "dark" ? "light" : "dark"} theme</span>
              </button>
              <button className="sheet-row" onClick={() => { onShortcuts(); onClose(); }}>
                <Icon name="key" size={15} /> <span className="grow">Keyboard shortcuts</span>
              </button>
              <button className="sheet-row" onClick={() => { onHome(); onClose(); }}>
                <Icon name="arrowRight" size={15} /> <span className="grow">Back to the landing page</span>
              </button>
              {session ? (
                <button className="sheet-row" onClick={() => { onSignOut(); onClose(); }}>
                  <Icon name="user" size={15} /> <span className="grow truncate">Sign out {session.email}</span>
                </button>
              ) : (
                <button className="sheet-row" onClick={() => { onSignIn(); onClose(); }}>
                  <Icon name="user" size={15} /> <span className="grow">Sign in to sync</span>
                </button>
              )}
            </div>
          </section>

          <div className="dimmer tiny center" style={{ padding: "4px 0 8px" }}>
            {NAV.reduce((n, g) => n + g.items.length, 0)} views · everything stays on this device
          </div>
        </div>
      </div>
    </div>
  );
}
