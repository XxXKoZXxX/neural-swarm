import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

serve(async (req) => {
  const stripeKey     = Deno.env.get("STRIPE_SECRET_KEY")!;
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  const sig  = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook sig failed:", err);
    return new Response("Signature verification failed", { status: 400 });
  }

  const db = (table: string) => `${supabaseUrl}/rest/v1/${table}`;
  const headers = { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: "return=representation" };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const templateId = session.metadata?.templateId;
    const userId = session.metadata?.userId || null;

    if (templateId) {
      await fetch(db("template_purchases"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          template_id: templateId,
          // Attributed by the checkout function. Without this the
          // duplicate-purchase guard has nothing to match on.
          user_id: userId,
          customer_email: session.customer_details?.email,
          amount: (session.amount_total ?? 0) / 100,
        }),
      });
      const tplRes = await fetch(`${db("templates")}?id=eq.${templateId}`, { headers });
      const [tpl] = await tplRes.json();
      if (tpl) {
        await fetch(`${db("templates")}?id=eq.${templateId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ usage_count: (tpl.usage_count ?? 0) + 1 }),
        });
      }
    }

    if (session.mode === "subscription") {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const email = session.customer_details?.email ?? "";
      const plan  = resolvePlan(sub);
      await upsertSubscription(db, headers, email, plan, sub);
      await syncUserTier(db, headers, userId ?? sub.metadata?.userId ?? null, plan);
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub     = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    const email   = customer.email ?? "";
    const plan    = resolvePlan(sub);
    await upsertSubscription(db, headers, email, plan, sub);
    await syncUserTier(db, headers, sub.metadata?.userId ?? null, plan);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub     = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    const email   = customer.email ?? "";
    await upsertSubscription(db, headers, email, "free", sub);
    await syncUserTier(db, headers, sub.metadata?.userId ?? null, "free");
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

function resolvePlan(sub: Stripe.Subscription): string {
  const amount = sub.items.data[0]?.price?.unit_amount ?? 0;
  if (amount >= 7900) return "power";
  if (amount >= 2900) return "pro";
  return "free";
}

async function upsertSubscription(
  db: (t: string) => string,
  headers: Record<string, string>,
  email: string,
  plan: string,
  sub: Stripe.Subscription,
) {
  await fetch(db("subscriptions"), {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_email: email,
      plan,
      status: sub.status,
      stripe_customer_id: sub.customer as string,
      current_period_end: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
    }),
  });
}

// public.users.tier is keyed by auth uid, so it can only be kept in step when
// checkout attributed the session to an account. The app reads its plan from
// `subscriptions`, so a missing id here degrades rather than breaks.
async function syncUserTier(
  db: (t: string) => string,
  headers: Record<string, string>,
  userId: string | null,
  plan: string,
) {
  if (!userId) {
    console.warn("[syncUserTier] no userId on session/subscription metadata; skipping users.tier");
    return;
  }
  try {
    const res = await fetch(`${db("users")}?id=eq.${userId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ tier: plan }),
    });
    if (!res.ok) console.error("[syncUserTier]", res.status, await res.text());
  } catch (err) {
    console.error("[syncUserTier] threw:", err);
  }
}
