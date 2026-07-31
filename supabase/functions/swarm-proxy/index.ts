import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORS, jsonError, preflight } from "../_shared/http.ts";

serve(async (req) => {
  const options = preflight(req);
  if (options) return options;

  const anthropicKey = Deno.env.get("ANTHROPIC_KEY");
  if (!anthropicKey) return jsonError("ANTHROPIC_KEY not set", 500);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
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
