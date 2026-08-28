import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { restClient } from "../_shared/supabase.ts";

type Db = ReturnType<typeof restClient>;

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

  const db = restClient(supabaseUrl, supabaseKey);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const templateId = session.metadata?.templateId;
    const userId = session.metadata?.userId || null;

    if (templateId) {
      await db.insert("template_purchases", {
        template_id: templateId,
        // Attributed by the checkout function. Without this the
        // duplicate-purchase guard has nothing to match on.
        user_id: userId,
        customer_email: session.customer_details?.email,
        amount: (session.amount_total ?? 0) / 100,
      });
      const [tpl] = await db.select<{ usage_count?: number }>("templates", `id=eq.${templateId}`);
      if (tpl) {
        await db.patch("templates", `id=eq.${templateId}`, { usage_count: (tpl.usage_count ?? 0) + 1 });
      }
    }

    if (session.mode === "subscription") {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const email = session.customer_details?.email ?? "";
      const plan  = resolvePlan(sub);
      await upsertSubscription(db, email, plan, sub);
      await syncUserTier(db, userId ?? sub.metadata?.userId ?? null, plan);
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub   = event.data.object as Stripe.Subscription;
    const email = await customerEmail(stripe, sub);
    const plan  = resolvePlan(sub);
    await upsertSubscription(db, email, plan, sub);
    await syncUserTier(db, sub.metadata?.userId ?? null, plan);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub   = event.data.object as Stripe.Subscription;
    const email = await customerEmail(stripe, sub);
    await upsertSubscription(db, email, "free", sub);
    await syncUserTier(db, sub.metadata?.userId ?? null, "free");
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function customerEmail(stripe: Stripe, sub: Stripe.Subscription): Promise<string> {
  const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
  return customer.email ?? "";
}

function resolvePlan(sub: Stripe.Subscription): string {
  const amount = sub.items.data[0]?.price?.unit_amount ?? 0;
  if (amount >= 7900) return "power";
  if (amount >= 2900) return "pro";
  return "free";
}

async function upsertSubscription(
  db: Db,
  email: string,
  plan: string,
  sub: Stripe.Subscription,
) {
  await db.insert("subscriptions", {
    user_email: email,
    plan,
    status: sub.status,
    stripe_customer_id: sub.customer as string,
    current_period_end: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
  }, { Prefer: "resolution=merge-duplicates,return=representation" });
}

// public.users.tier is keyed by auth uid, so it can only be kept in step when
// checkout attributed the session to an account. The app reads its plan from
// `subscriptions`, so a missing id here degrades rather than breaks.
async function syncUserTier(
  db: Db,
  userId: string | null,
  plan: string,
) {
  if (!userId) {
    console.warn("[syncUserTier] no userId on session/subscription metadata; skipping users.tier");
    return;
  }
  try {
    const res = await db.patch("users", `id=eq.${userId}`, { tier: plan });
    if (!res.ok) console.error("[syncUserTier]", res.status, await res.text());
  } catch (err) {
    console.error("[syncUserTier] threw:", err);
  }
}
