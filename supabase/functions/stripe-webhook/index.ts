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

  // ── Template purchase fulfilled ────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const templateId = session.metadata?.templateId;

    if (templateId) {
      // Record purchase
      await db.insert("template_purchases", {
        template_id: templateId,
        customer_email: session.customer_details?.email,
        amount: (session.amount_total ?? 0) / 100,
      });
      // Increment usage count
      const [tpl] = await db.select<{ usage_count?: number }>("templates", `id=eq.${templateId}`);
      if (tpl) {
        await db.patch("templates", `id=eq.${templateId}`, { usage_count: (tpl.usage_count ?? 0) + 1 });
      }
    }

    // Subscription checkout completed — upsert subscription record
    if (session.mode === "subscription") {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const email = session.customer_details?.email ?? "";
      await upsertSubscription(db, email, resolvePlan(sub), sub);
    }
  }

  // ── Subscription updated / renewed ────────────────────────────────────────
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub = event.data.object as Stripe.Subscription;
    await upsertSubscription(db, await customerEmail(stripe, sub), resolvePlan(sub), sub);
  }

  // ── Subscription cancelled ────────────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await upsertSubscription(db, await customerEmail(stripe, sub), "free", sub);
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
  // Match price amount to plan tier ($29 = pro, $79 = power)
  const amount = sub.items.data[0]?.price?.unit_amount ?? 0;
  if (amount >= 7900) return "power";
  if (amount >= 2900) return "pro";
  return "free";
}

function upsertSubscription(db: Db, email: string, plan: string, sub: Stripe.Subscription) {
  return db.insert("subscriptions", {
    user_email: email,
    plan,
    status: sub.status,
    stripe_customer_id: sub.customer as string,
    current_period_end: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
  }, { Prefer: "resolution=merge-duplicates,return=representation" });
}
