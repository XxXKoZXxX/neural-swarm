// CORS + JSON helpers shared by the edge functions. Each function still decides
// its own origin policy: swarm-proxy pins an allowlist, the Stripe entrypoints
// are called from any deployed frontend.

export type Cors = Record<string, string>;

export function corsHeaders({
  origin = null,
  allowOrigins,
  fallbackOrigin = "*",
  allowHeaders = "authorization, content-type",
  methods = "POST, OPTIONS",
  maxAge,
}: {
  origin?: string | null;
  allowOrigins?: Set<string>;
  fallbackOrigin?: string;
  allowHeaders?: string;
  methods?: string;
  maxAge?: string;
} = {}): Cors {
  const allowed = allowOrigins
    ? (origin && allowOrigins.has(origin) ? origin : fallbackOrigin)
    : fallbackOrigin;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": methods,
    ...(maxAge ? { "Access-Control-Max-Age": maxAge } : {}),
    ...(allowOrigins ? { "Vary": "Origin" } : {}),
  };
}

export const jsonWith = (cors: Cors) => (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
