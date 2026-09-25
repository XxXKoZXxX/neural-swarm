import { useState } from "react";
import { Badge, Button, Field, Input, Modal } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { Icon } from "./icons.jsx";
import { mkAuth } from "../lib/store.js";
import { UPGRADE_TIERS } from "../lib/constants.js";

/** Sign in / sign up. Falls back to a local-only session when Supabase is absent. */
export function AuthModal({ supabase, onSession, onClose, onLocal }) {
  const toast = useToast();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Use at least 6 characters for the password.");
    setBusy(true);
    try {
      if (supabase?.url && supabase?.key) {
        const auth = mkAuth(supabase.url, supabase.key);
        const data = mode === "signin" ? await auth.signIn(email, password) : await auth.signUp(email, password);
        if (data?.access_token) {
          onSession({ email: data.user?.email || email, access_token: data.access_token, id: data.user?.id });
          toast.success(mode === "signin" ? "Signed in" : "Account created");
          return;
        }
        if (mode === "signup") {
          toast.info("Check your inbox to confirm the account, or continue in local mode.");
        }
      } else {
        toast.warn("Supabase is not configured — continuing with a local profile.");
      }
      onLocal?.({ email });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "signin" ? "Sign in" : "Create an account"}
      subtitle={supabase?.url ? "Synced through Supabase — your runs follow you across devices." : "No Supabase configured: a local profile is created in this browser."}
      footer={
        <>
          <Button onClick={() => onLocal?.({ email: "local@device" })} variant="ghost">
            Continue locally
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <div className="row gap-6">
          <Button size="sm" variant={mode === "signin" ? "primary" : "ghost"} onClick={() => setMode("signin")}>
            Sign in
          </Button>
          <Button size="sm" variant={mode === "signup" ? "primary" : "ghost"} onClick={() => setMode("signup")}>
            Create account
          </Button>
        </div>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>
        <Field label="Password" hint="Stored only by Supabase Auth; never sent anywhere else.">
          <Input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
        </Field>
        {error ? (
          <div className="row gap-8" style={{ color: "var(--accent-rose)" }}>
            <Icon name="alert" size={14} />
            <span className="small">{error}</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Plan limit reached — upgrade paths plus a demo unlock. */
export function UpgradeModal({ open = true, used, limit, supabase, jwt, onClose, onDemoUnlock, plan }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const checkout = async (tier) => {
    if (!supabase?.url) return toast.warn("Set your Supabase URL in Settings to enable Stripe checkout.");
    setBusy(tier);
    try {
      const res = await fetch(`${String(supabase.url).replace(/\/+$/, "")}/functions/v1/stripe-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ plan: tier }),
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) throw new Error(`stripe-checkout is not deployed (HTTP ${res.status})`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // eslint-disable-next-line react-hooks/immutability -- redirect in a click-triggered async handler, never during render
      if (data.url) window.location.href = data.url;
      else throw new Error("Stripe returned no checkout URL.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="You have reached the free plan limit"
      subtitle={`${used}/${limit} runs used on the ${String(plan).toUpperCase()} plan. Bring your own model key — we never mark up tokens.`}
      wide
      footer={<Button onClick={onClose}>Stay on free</Button>}
    >
      <div className="grid-2">
        {UPGRADE_TIERS.map((tier) => (
          <div key={tier.id} className={`price-card ${tier.id === "pro" ? "featured" : ""}`}>
            <div className="row between">
              <span className="strong">{tier.name}</span>
              {tier.id === "pro" ? <Badge tone="accent">most popular</Badge> : null}
            </div>
            <div className="row gap-4 mt-8" style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 26, fontWeight: 750 }}>{tier.price}</span>
              <span className="dim small">{tier.per}</span>
            </div>
            <div className="col gap-6 mt-12 grow">
              {tier.features.map((f) => (
                <div key={f} className="row gap-8 tiny muted">
                  <Icon name="check" size={13} style={{ color: "var(--accent)" }} />
                  {f}
                </div>
              ))}
            </div>
            <Button variant={tier.id === "pro" ? "primary" : "default"} className="mt-16" onClick={() => checkout(tier.id)} disabled={busy === tier.id}>
              {busy === tier.id ? "Opening Stripe…" : `Upgrade to ${tier.name}`}
            </Button>
          </div>
        ))}
      </div>
      <div className="row gap-8 mt-16">
        <Button variant="ghost" icon="wand" onClick={onDemoUnlock}>
          Unlock Pro for this session (demo)
        </Button>
        <span className="dimmer tiny">Demo unlock is client-side only and resets on reload — it exists so the paid views can be explored.</span>
      </div>
    </Modal>
  );
}

/** Publish the current run as a marketplace template. */
export function PublishModal({ goal, onPublish, onClose, initialName = "", initialDesc = "" }) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [cat, setCat] = useState("Build");
  const [price, setPrice] = useState("0");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onPublish({ name: name.trim(), desc: desc.trim(), cat, price: Math.max(0, Number(price) || 0), tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish as a template"
      subtitle="Share this workflow with the marketplace"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stripe-billed API starter" />
        </Field>
        <Field label="Description">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this workflow produces" />
        </Field>
        <div className="grid-3">
          <Field label="Category">
            <Input value={cat} onChange={(e) => setCat(e.target.value)} />
          </Field>
          <Field label="Price (USD)">
            <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Tags">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="saas, api" />
          </Field>
        </div>
        <Field label="Goal template" hint="Saved exactly as it is — include the blanks you want filled in.">
          <textarea className="textarea" readOnly value={goal} style={{ minHeight: 90, fontSize: 12, fontFamily: "var(--font-mono)" }} />
        </Field>
      </div>
    </Modal>
  );
}
