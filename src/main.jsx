import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import "./index.css";
import App from "./App.jsx";
import { ToastProvider } from "./components/ui.jsx";
import { migrateLegacyStorage } from "./lib/store.js";

// Users of the pre-makeover build keep their custom agents, learned memory,
// vault and run history; this copies the old flat keys across exactly once.
migrateLegacyStorage();

/**
 * Error boundary: a crash in one view should never leave a blank page. The
 * fallback offers a reload and a one-click local-data reset.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[neural-swarm] render error", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card card-pad" style={{ maxWidth: 560 }}>
          <div className="row gap-10">
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div className="strong">Something in the studio crashed</div>
              <div className="tiny muted mt-4">Your saved runs, vault and workspace are untouched — this is a rendering failure.</div>
            </div>
          </div>
          <pre className="mono tiny muted mt-16" style={{ whiteSpace: "pre-wrap", background: "var(--bg-inset)", padding: 12, borderRadius: "var(--r-sm)", maxHeight: 200, overflow: "auto" }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
          <div className="row gap-8 mt-16">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            <button
              className="btn"
              onClick={() => {
                try {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith("ns."))
                    .forEach((k) => localStorage.removeItem(k));
                } catch {
                  /* storage unavailable */
                }
                window.location.reload();
              }}
            >
              Reset local data and reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
    <SpeedInsights />
  </StrictMode>,
);
