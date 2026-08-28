import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders, jsonWith } from "../_shared/http.ts";
import { resolveUser, RestError, restClient } from "../_shared/supabase.ts";

const CORS = corsHeaders();

const PRICE_IDS: Record<string, string> = {
  pro:   Deno.env.get("STRIPE_PRICE_PRO")   ?? "price_REPLACE_PRO",
  power: Deno.env.get("STRIPE_PRICE_POWER") ?? "price_REPLACE_POWER",
};

const json = jsonWith(CORS);

// Turn a thrown Stripe error into something the browser can actually act on.
// Previously these escaped unhandled and the client saw a generic failure with
// no cause, which is why an archived-product 400 read as "failed to reach Stripe".
function stripeError(err: unknown, context: string) {
  const e = err as {
    message?: string;
    type?: string;
    rawType?: string;
    code?: string;
    param?: string;
    statusCode?: number;
    requestId?: string;
  };
  const status = typeof e?.statusCode === "number" ? e.statusCode : 502;
  console.error(`[${context}] stripe ${e?.rawType ?? e?.type ?? "error"} ${status}: ${e?.message}`, {
    param: e?.param,
    code: e?.code,
    requestId: e?.requestId,
  });
  return json({
    error: e?.message ?? "Stripe request failed",
    context,
    stripe_type: e?.rawType ?? e?.type ?? null,
    stripe_code: e?.code ?? null,
    stripe_param: e?.param ?? null,
    stripe_request_id: e?.requestId ?? null,
  }, status >= 400 && status < 600 ? status : 502);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not set" }, 500);

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let body: { plan?: string; templateId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Resolve the caller once, so both flows can attribute the purchase to a real
  // account instead of relying on whatever email the buyer types into Stripe.
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerJwt = authHeader.replace("Bearer ", "").trim();
  const db = restClient(supabaseUrl, supabaseKey);
  let user: { id: string; email?: string } | null = null;
  try {
    user = await resolveUser(supabaseUrl, supabaseKey, callerJwt);
  } catch (err) {
    console.error("[auth.resolve] threw, continuing unattributed:", err);
  }

  // ── Subscription checkout ────────────────────────────────────────────
  if (body.plan && PRICE_IDS[body.plan]) {
    const priceId = PRICE_IDS[body.plan];

    if (priceId.startsWith("price_REPLACE_")) {
      return json({
        error: `Price ID for plan "${body.plan}" is not configured`,
        context: "config",
        hint: `Set STRIPE_PRICE_${body.plan.toUpperCase()} in the Edge Function environment.`,
      }, 500);
    }

    // Check the price and its product are live before creating a session, so a
    // misconfiguration reports as a config problem rather than a checkout failure.
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      const product = price.product as Stripe.Product | Stripe.DeletedProduct;
      const productActive = "active" in product ? product.active : false;
      if (!price.active || !productActive) {
        return json({
          error: `Plan "${body.plan}" is not purchasable right now.`,
          context: "price_inactive",
          detail: !price.active
            ? `Price ${priceId} is archived in Stripe.`
            : `The product behind price ${priceId} is archived in Stripe.`,
          price_id: priceId,
          hint: "Reactivate the product/price in the Stripe dashboard, or point STRIPE_PRICE_* at a live price.",
        }, 409);
      }
    } catch (err) {
      return stripeError(err, "prices.retrieve");
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        ...(user?.email ? { customer_email: user.email } : {}),
        metadata: { userId: user?.id ?? "", plan: body.plan },
        // Carried onto the subscription itself so later customer.subscription.*
        // events can still be tied back to the account.
        subscription_data: { metadata: { userId: user?.id ?? "", plan: body.plan } },
        success_url: `${frontendUrl.trim()}?upgraded=true&plan=${body.plan}`,
        cancel_url:  `${frontendUrl.trim()}?upgraded=false`,
      });
      return json({ url: session.url });
    } catch (err) {
      return stripeError(err, "checkout.sessions.create:subscription");
    }
  }

  // ── One-off template purchase ────────────────────────────────────────
  if (body.templateId) {
    const tid = body.templateId;

    let tpl: { id: string; name: string; price: number } | undefined;
    try {
      [tpl] = await db.select<{ id: string; name: string; price: number }>(
        "templates",
        `id=eq.${tid}&select=id,name,price`,
      );
    } catch (err) {
      console.error("[templates.lookup] failed:", err);
      const status = err instanceof RestError ? err.status : undefined;
      return json({ error: "Template lookup failed", context: "templates.lookup", ...(status ? { status } : {}) }, 502);
    }

    if (!tpl) return json({ error: "Template not found" }, 404);

    // Match on user_id OR email. Rows written before this change carry only
    // customer_email, and checking user_id alone meant the duplicate-purchase
    // guard never fired - the same template could be bought repeatedly.
    if (user?.id) {
      try {
        const ors = [`user_id.eq.${user.id}`];
        if (user.email) ors.push(`customer_email.eq.${user.email}`);
        const purchases = await db.select(
          "template_purchases",
          `template_id=eq.${tid}&or=(${ors.join(",")})`,
        );
        if (Array.isArray(purchases) && purchases.length > 0) {
          return json({ already_purchased: true });
        }
      } catch (err) {
        // A failed duplicate-purchase check should not block checkout.
        console.error("[purchase.precheck] threw, continuing:", err);
      }
    }

    if (!tpl.price || tpl.price === 0) return json({ already_purchased: true });

    try {
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
        ...(user?.email ? { customer_email: user.email } : {}),
        success_url: `${frontendUrl.trim()}?purchase=success&template=${tid}`,
        cancel_url:  `${frontendUrl.trim()}?purchase=cancelled`,
        metadata: { templateId: tid, userId: user?.id ?? "" },
      });
      return json({ url: session.url });
    } catch (err) {
      return stripeError(err, "checkout.sessions.create:template");
    }
  }

  return json({ error: "Provide plan or templateId" }, 400);
});
