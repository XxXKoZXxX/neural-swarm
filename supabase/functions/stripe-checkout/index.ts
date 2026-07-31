import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { json, jsonError, preflight } from "../_shared/http.ts";
import { restClient } from "../_shared/supabase.ts";

// Paste your Stripe price IDs here after creating the products in Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  pro:   Deno.env.get("STRIPE_PRICE_PRO")   ?? "price_REPLACE_PRO",
  power: Deno.env.get("STRIPE_PRICE_POWER") ?? "price_REPLACE_POWER",
};

serve(async (req) => {
  const options = preflight(req);
  if (options) return options;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!stripeKey) return jsonError("STRIPE_SECRET_KEY not set", 500);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const db = restClient(supabaseUrl, supabaseKey);

  let body: { plan?: string; templateId?: string };
  try { body = await req.json(); } catch {
    return jsonError("Invalid JSON", 400);
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
    return json({ url: session.url });
  }

  // ── One-time template purchase ─────────────────────────────────────────────
  if (body.templateId) {
    const tid = body.templateId;

    // Fetch template price from Supabase
    const [tpl] = await db.select<{ id: string; name: string; price: number }>(
      "templates",
      `id=eq.${tid}&select=id,name,price`,
    );
    if (!tpl) return jsonError("Template not found", 404);

    // Check for existing purchase (using email from JWT if present)
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (jwt && jwt !== supabaseKey) {
      const user = await db.user(jwt);
      if (user) {
        const purchases = await db.select("template_purchases", `user_id=eq.${user.id}&template_id=eq.${tid}`);
        if (purchases?.length > 0) return json({ already_purchased: true });
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

  return jsonError("Provide plan or templateId", 400);
});
