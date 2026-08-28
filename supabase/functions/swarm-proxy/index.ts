// swarm-proxy
//
// Owner (KoZ) -> server-side Anthropic key, never leaves this function.
// Everyone else -> must send their own key in `x-anthropic-key`.
// No key, not owner -> 402. No fallback.
//
// The owner allowlist is a Supabase auth user id, not a secret, so it lives in
// source. The Anthropic key stays in the existing ANTHROPIC_KEY secret.
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.

import { corsHeaders, jsonWith } from "../_shared/http.ts";
import { resolveUser } from "../_shared/supabase.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const OWNER_KEY =
  Deno.env.get("ANTHROPIC_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const OWNER_IDS = new Set([
  "2b509dcb-75f3-4f53-8b9a-b40daf95334a",
]);
const OWNER_EMAILS = new Set([
  "michaelkosminsky@gmail.com",
]);

const ALLOWED_ORIGINS = new Set([
  "https://neural-swarm.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);

// Ceiling on the owner's own key.
const OWNER_MAX_TOKENS = 8192;

const cors = (origin: string | null) =>
  corsHeaders({
    origin,
    allowOrigins: ALLOWED_ORIGINS,
    fallbackOrigin: "https://neural-swarm.vercel.app",
    allowHeaders: "authorization, x-anthropic-key, content-type, apikey",
    maxAge: "86400",
  });

/** Resolve the caller to a real Supabase user, or null. */
async function owner(jwt: string): Promise<{ id: string; email: string } | null> {
  try {
    const u = await resolveUser(SUPABASE_URL, ANON_KEY, jwt);
    if (!u) return null;
    return {
      id: String(u.id).toLowerCase(),
      email: String(u.email ?? "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const H = cors(req.headers.get("origin"));
  const json = jsonWith(H);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const jwt = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const byok = (req.headers.get("x-anthropic-key") ?? "").trim();

  const user = await owner(jwt);
  const isOwner = !!user &&
    (OWNER_IDS.has(user.id) || OWNER_EMAILS.has(user.email));

  let apiKey: string;
  let mode: "owner" | "byok";

  if (isOwner && OWNER_KEY) {
    apiKey = OWNER_KEY;
    mode = "owner";
    const asked = Number(payload.max_tokens ?? OWNER_MAX_TOKENS);
    payload.max_tokens = Math.min(
      Number.isFinite(asked) ? asked : OWNER_MAX_TOKENS,
      OWNER_MAX_TOKENS,
    );
  } else if (byok.startsWith("sk-ant-")) {
    apiKey = byok;
    mode = "byok";
  } else {
    return json(
      {
        error: "byok_required",
        message:
          "This swarm runs on your own Anthropic key. Add one in Settings -> ANTHROPIC KEY (console.anthropic.com -> API Keys).",
      },
      402,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", message: String(e) }, 502);
  }

  // Never leak the state of the server key to a client.
  if (!upstream.ok && mode === "owner" && upstream.status === 401) {
    return json(
      { error: "server_key_invalid", message: "Server key rejected. Contact the operator." },
      500,
    );
  }

  const isStream = payload.stream === true &&
    (upstream.headers.get("content-type") ?? "").includes("event-stream");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...H,
      "Content-Type": isStream ? "text/event-stream" : "application/json",
      "Cache-Control": "no-cache",
      "X-Swarm-Mode": mode,
    },
  });
});
