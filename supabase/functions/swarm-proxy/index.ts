import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-3-7-20250219",
]);

const MAX_TOKENS_CAP = 4096;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return false;

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  // The anon key is public — it must never count as a user credential here.
  if (!jwt || jwt === anonKey) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  return Boolean(user?.id);
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, CORS);

  const anthropicKey = Deno.env.get("ANTHROPIC_KEY");
  if (!anthropicKey) return json({ error: "ANTHROPIC_KEY not set" }, 500, CORS);

  if (!(await authenticate(req))) return json({ error: "Unauthorized" }, 401, CORS);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, CORS);
  }

  const model = typeof body.model === "string" ? body.model : "";
  if (!ALLOWED_MODELS.has(model)) return json({ error: "Unsupported model" }, 400, CORS);

  const requestedTokens = typeof body.max_tokens === "number" ? body.max_tokens : 1000;
  if (!Number.isFinite(requestedTokens) || requestedTokens < 1) {
    return json({ error: "Invalid max_tokens" }, 400, CORS);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages required" }, 400, CORS);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      ...body,
      model,
      max_tokens: Math.min(requestedTokens, MAX_TOKENS_CAP),
    }),
  });

  // Stream the response straight through
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
});
