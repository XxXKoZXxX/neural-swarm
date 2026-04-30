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

  // ── Template purchase fulfilled ────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const templateId = session.metadata?.templateId;

    if (templateId) {
      // Record purchase
      await fetch(db("template_purchases"), {
        method: "POST",
        headers,
        body: JSON.stringify({ template_id: templateId, customer_email: session.customer_details?.email, amount: (session.amount_total ?? 0) / 100 }),
      });
      // Increment usage count
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

    // Subscription checkout completed — upsert subscription record
    if (session.mode === "subscription") {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const email = session.customer_details?.email ?? "";
      const plan  = resolvePlan(sub);
      await upsertSubscription(db, headers, email, plan, sub);
    }
  }

  // ── Subscription updated / renewed ────────────────────────────────────────
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub     = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    const email   = customer.email ?? "";
    const plan    = resolvePlan(sub);
    await upsertSubscription(db, headers, email, plan, sub);
  }

  // ── Subscription cancelled ────────────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub     = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    const email   = customer.email ?? "";
    await upsertSubscription(db, headers, email, "free", sub);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

function resolvePlan(sub: Stripe.Subscription): string {
  // Match price amount to plan tier ($29 = pro, $79 = power)
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
