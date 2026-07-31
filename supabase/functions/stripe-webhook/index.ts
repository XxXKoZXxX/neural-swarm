import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Throws on non-2xx so fulfilment failures surface as a 500 and Stripe retries
// the webhook instead of the write being silently dropped.
async function dbFetch(url: string, init: RequestInit, what: string): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} returned a non-JSON body: ${text.slice(0, 200)}`);
  }
}

serve(async (req) => {
  let stripe: Stripe;
  let webhookSecret: string;
  let supabaseUrl: string;
  let supabaseKey: string;
  try {
    webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
    supabaseUrl   = requireEnv("SUPABASE_URL");
    supabaseKey   = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  } catch (err) {
    console.error("Webhook misconfigured:", err);
    return new Response("Webhook misconfigured", { status: 500 });
  }

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

  try {
    // ── Template purchase fulfilled ────────────────────────────────────────────
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const templateId = session.metadata?.templateId;

      if (templateId) {
        // Record purchase
        await dbFetch(db("template_purchases"), {
          method: "POST",
          headers,
          body: JSON.stringify({ template_id: templateId, customer_email: session.customer_details?.email, amount: (session.amount_total ?? 0) / 100 }),
        }, "Recording template purchase");
        // Increment usage count
        const rows = await dbFetch(`${db("templates")}?id=eq.${templateId}`, { headers }, "Loading template");
        const tpl = Array.isArray(rows) ? rows[0] as { usage_count?: number } | undefined : undefined;
        if (tpl) {
          await dbFetch(`${db("templates")}?id=eq.${templateId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ usage_count: (tpl.usage_count ?? 0) + 1 }),
          }, "Incrementing template usage count");
        } else {
          console.warn(`Template ${templateId} not found while incrementing usage count`);
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
  } catch (err) {
    // 500 tells Stripe to retry — never ack an event we failed to fulfil.
    console.error(`Failed to process ${event.type} (${event.id}):`, err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
  if (!email) throw new Error(`Cannot upsert subscription ${sub.id}: no customer email`);
  await dbFetch(db("subscriptions"), {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_email: email,
      plan,
      status: sub.status,
      stripe_customer_id: sub.customer as string,
      current_period_end: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
    }),
  }, "Upserting subscription");
}
