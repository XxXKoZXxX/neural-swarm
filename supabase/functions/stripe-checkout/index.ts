import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Paste your Stripe price IDs here after creating the products in Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  pro:   Deno.env.get("STRIPE_PRICE_PRO")   ?? "price_REPLACE_PRO",
  power: Deno.env.get("STRIPE_PRICE_POWER") ?? "price_REPLACE_POWER",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function getJson(url: string, init: RequestInit, what: string): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${what} returned a non-JSON body`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not set" }, 500);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  let body: { plan?: string; templateId?: string };
  try { body = await req.json(); } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    // ── Subscription checkout (plan upgrade) ───────────────────────────────────
    if (body.plan) {
      const priceId = PRICE_IDS[body.plan];
      if (!priceId) return json({ error: `Unknown plan: ${body.plan}` }, 400);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${frontendUrl}?upgraded=true&plan=${body.plan}`,
        cancel_url:  `${frontendUrl}?upgraded=false`,
      });
      return json({ url: session.url });
    }

    // ── One-time template purchase ─────────────────────────────────────────────
    if (body.templateId) {
      const tid = body.templateId;
      if (!supabaseUrl || !supabaseKey) return json({ error: "Supabase env vars not set" }, 500);

      // Fetch template price from Supabase
      const rows = await getJson(
        `${supabaseUrl}/rest/v1/templates?id=eq.${tid}&select=id,name,price`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
        "Template lookup",
      );
      const tpl = Array.isArray(rows) ? rows[0] as { name: string; price?: number } | undefined : undefined;
      if (!tpl) return json({ error: "Template not found" }, 404);

      // Check for existing purchase (using email from JWT if present)
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace("Bearer ", "");
      if (jwt && jwt !== supabaseKey) {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${jwt}` },
        });
        if (userRes.ok) {
          const user = await userRes.json() as { id: string };
          const purchases = await getJson(
            `${supabaseUrl}/rest/v1/template_purchases?user_id=eq.${user.id}&template_id=eq.${tid}`,
            { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
            "Purchase lookup",
          );
          if (Array.isArray(purchases) && purchases.length > 0) return json({ already_purchased: true });
        } else {
          // A rejected token means we cannot dedupe; continue to checkout rather than
          // failing the request, but make the reason visible in the logs.
          console.warn(`Could not resolve user from JWT (HTTP ${userRes.status}) — skipping duplicate-purchase check`);
        }
      }

      if (!tpl.price || tpl.price === 0) return json({ already_purchased: true });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: Math.round(tpl.price * 100),
            product_data: { name: tpl.name },
          },
          quantity: 1,
        }],
        success_url: `${frontendUrl}?purchase=success&template=${tid}`,
        cancel_url:  `${frontendUrl}?purchase=cancelled`,
        metadata: { templateId: tid },
      });

      return json({ url: session.url });
    }

    return json({ error: "Provide plan or templateId" }, 400);
  } catch (err) {
    console.error("stripe-checkout failed:", err);
    return json({ error: (err as Error).message }, 502);
  }
});
