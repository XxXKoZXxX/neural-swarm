/** Design-system primitives shared by every view. */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { copyText } from "../lib/store.js";
import { ToastContext } from "../hooks/useToast.js";

/* ── buttons ────────────────────────────────────────────────────────────── */
export function Button({ children, variant = "default", size, icon, iconRight, className = "", ...rest }) {
  const v = variant === "default" ? "" : `btn-${variant}`;
  const s = size ? `btn-${size}` : "";
  return (
    <button className={`btn ${v} ${s} ${className}`.trim()} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 12 : 14} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 12 : 14} /> : null}
    </button>
  );
}

export function IconButton({ name, label, size = 15, className = "", variant = "ghost", ...rest }) {
  return (
    <button className={`btn btn-icon ${variant === "ghost" ? "btn-ghost" : `btn-${variant}`} ${className}`.trim()} title={label} aria-label={label} {...rest}>
      <Icon name={name} size={size} />
    </button>
  );
}

export function CopyButton({ value, label = "Copy", size = "sm" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      icon={done ? "check" : "copy"}
      onClick={async () => {
        if (await copyText(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

/* ── surfaces ───────────────────────────────────────────────────────────── */
export function Card({ title, subtitle, actions, children, className = "", pad = true, style }) {
  return (
    <section className={`card ${className}`.trim()} style={style}>
      {(title || actions) && (
        <header className="row between gap-12" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-soft)" }}>
          <div className="grow">
            <div className="strong small">{title}</div>
            {subtitle ? <div className="dim tiny" style={{ marginTop: 2 }}>{subtitle}</div> : null}
          </div>
          {actions ? <div className="row gap-6">{actions}</div> : null}
        </header>
      )}
      <div className={pad ? "card-pad" : ""}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "default", icon, title }) {
  return (
    <span className={`badge ${tone === "default" ? "" : `badge-${tone}`}`.trim()} title={title}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  );
}

export function Dot({ status = "idle", size = 7, pulse = false }) {
  const color =
    { done: "var(--accent)", running: "var(--accent-cyan)", queued: "var(--accent-amber)", error: "var(--accent-rose)", simulated: "var(--accent-violet)" }[status] || "var(--text-4)";
  return <span className={`dot${pulse && status === "running" ? " pulse" : ""}`} style={{ width: size, height: size, background: color, boxShadow: status === "running" ? `0 0 8px ${color}` : "none" }} />;
}

export function StatusPill({ status, label }) {
  const map = {
    done: { tone: "accent", text: label || "done" },
    running: { tone: "default", text: label || "running" },
    queued: { tone: "warn", text: label || "queued" },
    error: { tone: "danger", text: label || "failed" },
    idle: { tone: "default", text: label || "idle" },
  };
  const cfg = map[status] || map.idle;
  return (
    <Badge tone={cfg.tone}>
      <Dot status={status} pulse />
      {cfg.text}
    </Badge>
  );
}

/* ── forms ──────────────────────────────────────────────────────────────── */
export function Field({ label, hint, children, htmlFor, className = "" }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export const Input = ({ className = "", ...rest }) => <input className={`input ${className}`.trim()} {...rest} />;
export const Textarea = ({ className = "", ...rest }) => <textarea className={`textarea ${className}`.trim()} {...rest} />;

export function Select({ options = [], className = "", ...rest }) {
  return (
    <select className={`select ${className}`.trim()} {...rest}>
      {options.map((o) => {
        const value = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

export function Switch({ checked, onChange, label, id }) {
  const auto = useId();
  const inputId = id || auto;
  return (
    <span className="row gap-8">
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="switch"
        onClick={() => onChange(!checked)}
      />
      {label ? (
        <label htmlFor={inputId} className="small" style={{ cursor: "pointer" }} onClick={() => onChange(!checked)}>
          {label}
        </label>
      ) : null}
    </span>
  );
}

export function Segmented({ value, onChange, options = [], size }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        const icon = typeof o === "string" ? null : o.icon;
        return (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)} style={size === "sm" ? { padding: "4px 9px", fontSize: 11 } : undefined}>
            {icon ? <Icon name={icon} size={12} /> : null}
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className = "", onClear }) {
  return (
    <div className={`search ${className}`.trim()}>
      <Icon name="search" size={14} />
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} type="search" />
      {value && onClear ? (
        <button className="btn btn-icon btn-ghost" style={{ position: "absolute", right: 4 }} onClick={onClear} aria-label="Clear search">
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </div>
  );
}

/* ── feedback ───────────────────────────────────────────────────────────── */
export function Progress({ value = 0, height = 6, indeterminate = false }) {
  return (
    <div className="progress" style={{ height }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: indeterminate ? "40%" : `${Math.max(0, Math.min(100, value))}%`, animation: indeterminate ? "shimmer 1.2s linear infinite" : undefined }} />
    </div>
  );
}

export const Spinner = ({ size = 14 }) => <span className="spinner" style={{ width: size, height: size }} aria-label="loading" />;

export function Skel({ height = 12, width = "100%", style }) {
  return <div className="skel" style={{ height, width, ...style }} />;
}

export function EmptyState({ icon = "swarm", title, children, action }) {
  return (
    <div className="empty">
      <div style={{ display: "grid", placeItems: "center", marginBottom: 10, color: "var(--text-4)" }}>
        <Icon name={icon} size={26} />
      </div>
      <div className="strong small" style={{ color: "var(--text-2)" }}>
        {title}
      </div>
      {children ? <div className="tiny dim" style={{ marginTop: 6, maxWidth: "58ch", marginInline: "auto" }}>{children}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

export function Tooltip({ label, children }) {
  return (
    <span className="tip">
      {children}
      <span className="tip-body" role="tooltip">
        {label}
      </span>
    </span>
  );
}

/* ── overlays ───────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, subtitle, children, footer, wide = false, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Tab" && ref.current) {
        const nodes = ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const focusable = ref.current?.querySelector("input, textarea, button");
      focusable?.focus();
    }, 40);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? "modal-lg" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        <div className="modal-head">
          <div>
            <div className="strong" style={{ fontSize: 14 }} id={labelledBy}>
              {title}
            </div>
            {subtitle ? <div className="dim tiny" style={{ marginTop: 2 }}>{subtitle}</div> : null}
          </div>
          <IconButton name="close" label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" style={{ padding: 0, alignItems: "stretch", justifyContent: "flex-end" }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="row between gap-12" style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)" }}>
          <div className="strong">{title}</div>
          <IconButton name="close" label="Close" onClick={onClose} />
        </header>
        <div className="scroll-y" style={{ flex: 1, padding: 18 }}>
          {children}
        </div>
        {footer ? <footer style={{ padding: 14, borderTop: "1px solid var(--border)" }}>{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", tone = "danger", onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="small muted">{body}</p>
    </Modal>
  );
}

/* ── toasts ─────────────────────────────────────────────────────────────── */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = "info", ttl = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);
  const api = useMemo(
    () => ({
      info: (m) => push(m, "info"),
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error", 7000),
      warn: (m) => push(m, "warn", 6000),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-wrap" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === "error" ? "alert" : t.tone === "warn" ? "info" : t.tone === "success" ? "check" : "info"} size={14} style={{ marginTop: 2 }} />
            <span className="grow">{t.message}</span>
            <button className="btn btn-icon btn-ghost" onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── data display ───────────────────────────────────────────────────────── */
export function Stat({ label, value, sub, tone, icon }) {
  return (
    <div className="stat">
      <div className="row between">
        <span className="section-label">{label}</span>
        {icon ? <Icon name={icon} size={14} style={{ color: tone || "var(--text-4)" }} /> : null}
      </div>
      <div className="stat-value" style={{ color: tone || "var(--text)", marginTop: 6 }}>
        {value}
      </div>
      {sub ? <div className="tiny dim" style={{ marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

export function BarRow({ label, value, max = 1, color = "var(--accent)", right }) {
  return (
    <div className="bar-row">
      <span style={{ width: 118, flex: "none" }} className="truncate">
        {label}
      </span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`, background: color }} />
      </span>
      <span className="dim mono" style={{ width: 46, textAlign: "right", flex: "none" }}>
        {right ?? value}
      </span>
    </div>
  );
}

export function Sparkline({ data = [], height = 44, color = "var(--accent)", fill = true, label }) {
  const { path, area, max } = useMemo(() => {
    const values = data.length ? data : [0, 0];
    const maxV = Math.max(1, ...values);
    const step = values.length > 1 ? 100 / (values.length - 1) : 100;
    const points = values.map((v, i) => [i * step, 100 - (v / maxV) * 92]);
    const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    return { path: d, area: `${d} L100,100 L0,100 Z`, max: maxV };
  }, [data]);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} role="img" aria-label={label || "trend"}>
        {fill ? <path d={area} fill={color} opacity="0.16" /> : null}
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="dimmer tiny mono" style={{ position: "absolute", top: 0, right: 0 }}>
        peak {max}
      </span>
    </div>
  );
}

export function BarChart({ data = [], height = 120, color = "var(--accent)" }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="row" style={{ alignItems: "flex-end", gap: 4, height }} role="img" aria-label="bar chart">
      {data.map((d) => (
        <div key={d.label} className="col center grow" style={{ justifyContent: "flex-end", gap: 4 }} title={`${d.label}: ${d.value}`}>
          <div style={{ width: "100%", height: `${(d.value / max) * (height - 26)}px`, minHeight: d.value ? 3 : 1, background: d.value ? color : "var(--surface-2)", borderRadius: 3, opacity: d.value ? 0.85 : 1 }} />
          <span className="dimmer" style={{ fontSize: 9 }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScoreRing({ score, size = 62 }) {
  const value = Number(score) || 0;
  const pct = Math.max(0, Math.min(1, value / 10));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`score ${value} of 10`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={size * 0.28} fontWeight="700">
        {value || "–"}
      </text>
    </svg>
  );
}

export function Collapsible({ title, children, defaultOpen = false, right, icon }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <button className="row between gap-10" style={{ width: "100%", padding: "11px 14px", background: "transparent", border: 0, cursor: "pointer", color: "inherit", textAlign: "left" }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="row gap-8">
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
          {icon ? <Icon name={icon} size={14} /> : null}
          <span className="small strong">{title}</span>
        </span>
        {right}
      </button>
      {open ? <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border-soft)" }}>{children}</div> : null}
    </div>
  );
}

export function Tabs({ tabs = [], value, onChange, className = "" }) {
  return (
    <div className={`row gap-4 ${className}`.trim()} role="tablist" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          className="btn btn-ghost"
          style={{
            borderRadius: "var(--r-sm) var(--r-sm) 0 0",
            borderBottom: value === t.value ? "2px solid var(--accent)" : "2px solid transparent",
            color: value === t.value ? "var(--text)" : "var(--text-3)",
          }}
          onClick={() => onChange(t.value)}
        >
          {t.icon ? <Icon name={t.icon} size={13} /> : null}
          {t.label}
          {t.count != null ? <span className="dimmer tiny">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
