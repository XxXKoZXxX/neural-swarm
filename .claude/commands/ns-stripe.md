---
description: Stripe billing health check — verify webhooks, subscription gates, plans, and revenue logic.
---

# Neural Swarm — Stripe Health Check

Audit and verify the Stripe billing integration.

## Checks

### 1. Webhook Handler (`/app/api/webhooks/stripe/route.ts`)
```bash
grep -n "constructEvent\|stripe-signature\|webhookSecret" app/api/webhooks/stripe/route.ts
```
- [ ] `stripe.webhooks.constructEvent()` called with raw body
- [ ] Handles: `customer.subscription.created` `customer.subscription.updated` `customer.subscription.deleted` `invoice.payment_failed`
- [ ] Updates `subscriptions` table in Supabase on each event
- [ ] Returns `200` immediately (webhooks time out at 30s)

### 2. Subscription Gates
Scan for subscription checks in agent routes:
```bash
grep -rn "subscription\|plan\|stripe" app/api/agents/ --include="*.ts"
```
- [ ] Each agent route checks `subscription.status === 'active'`
- [ ] Free tier limits enforced (dispatch count, token limit)
- [ ] Proper 402 response when limit exceeded

### 3. Plan Configuration
Show current plan config in `lib/stripe.ts` or `lib/plans.ts`:
- Plans defined (free/beta/pro)
- Prices match Stripe dashboard
- Feature flags per plan

### 4. Stripe Client
```bash
grep -rn "Stripe\|stripe" lib/ --include="*.ts"
```
- [ ] Single Stripe instance in `lib/stripe.ts`
- [ ] Server-side only (not imported in client components)
- [ ] `STRIPE_SECRET_KEY` from env, not hardcoded

### 5. Customer Lifecycle
- [ ] Customer created on first Stripe checkout
- [ ] `stripe_customer_id` stored in Supabase `users` table
- [ ] Cancellation handled: features downgraded, not deleted

## Quick Fix Commands

```bash
# Test webhook locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Check recent events
stripe events list --limit 10

# Verify product prices
stripe prices list
```

Report issues with severity and exact file references.
