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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
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
      success_url: `${frontendUrl}?upgraded=true&plan=${body.plan}`,
      cancel_url:  `${frontendUrl}?upgraded=false`,
    });
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── One-time template purchase ─────────────────────────────────────────────
  if (body.templateId) {
    const tid = body.templateId;

    // Fetch template price from Supabase
    const tplRes = await fetch(
      `${supabaseUrl}/rest/v1/templates?id=eq.${tid}&select=id,name,price`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    const [tpl] = await tplRes.json();
    if (!tpl) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Check for existing purchase (using email from JWT if present)
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (jwt && jwt !== supabaseKey) {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${jwt}` },
      });
      if (userRes.ok) {
        const user = await userRes.json();
        const purchaseRes = await fetch(
          `${supabaseUrl}/rest/v1/template_purchases?user_id=eq.${user.id}&template_id=eq.${tid}`,
          { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
        );
        const purchases = await purchaseRes.json();
        if (purchases?.length > 0) {
          return new Response(JSON.stringify({ already_purchased: true }), {
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
      }
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
      success_url: `${frontendUrl}?purchase=success&template=${tid}`,
      cancel_url:  `${frontendUrl}?purchase=cancelled`,
      metadata: { templateId: tid },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Provide plan or templateId" }), {
    status: 400, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
