import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Paste your Stripe price IDs here after creating the products in Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  pro:   Deno.env.get("STRIPE_PRICE_PRO")   ?? "price_REPLACE_PRO",
  power: Deno.env.get("STRIPE_PRICE_POWER") ?? "price_REPLACE_POWER",
};

async function getUser(req: Request, supabaseUrl: string, anonKey: string) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  // The anon key is public — it must never count as a user credential here.
  if (!jwt || jwt === anonKey) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const user = await getUser(req, supabaseUrl, anonKey);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  let body: { plan?: string; templateId?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Subscription checkout (plan upgrade) ───────────────────────────────────
  if (body.plan && PRICE_IDS[body.plan]) {
    const priceId = PRICE_IDS[body.plan];
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email ?? undefined,
      metadata: { userId: user.id },
      success_url: `${frontendUrl}?upgraded=true&plan=${encodeURIComponent(body.plan)}`,
      cancel_url:  `${frontendUrl}?upgraded=false`,
    });
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── One-time template purchase ─────────────────────────────────────────────
  if (body.templateId) {
    const tid = body.templateId;
    if (!UUID_RE.test(tid)) {
      return new Response(JSON.stringify({ error: "Invalid templateId" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch template price from Supabase
    const tplRes = await fetch(
      `${supabaseUrl}/rest/v1/templates?id=eq.${encodeURIComponent(tid)}&select=id,name,price`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    const [tpl] = await tplRes.json();
    if (!tpl) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Check for existing purchase
    const purchaseRes = await fetch(
      `${supabaseUrl}/rest/v1/template_purchases?user_id=eq.${encodeURIComponent(user.id)}&template_id=eq.${encodeURIComponent(tid)}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    const purchases = await purchaseRes.json();
    if (purchases?.length > 0) {
      return new Response(JSON.stringify({ already_purchased: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!tpl.price || tpl.price === 0) {
      return new Response(JSON.stringify({ already_purchased: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

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
      success_url: `${frontendUrl}?purchase=success&template=${encodeURIComponent(tid)}`,
      cancel_url:  `${frontendUrl}?purchase=cancelled`,
      metadata: { templateId: tid, userId: user.id },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Provide plan or templateId" }), {
    status: 400, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
