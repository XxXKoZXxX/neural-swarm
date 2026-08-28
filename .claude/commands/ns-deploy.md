---
description: Pre-deploy checklist + Vercel deployment for Neural Swarm.
---

# Neural Swarm — Deploy

Pre-flight check then push to Vercel.

## Pre-Deploy Checklist

### Build
```bash
npm run build 2>&1 | tail -30
```
- [ ] Build passes with 0 errors
- [ ] No TypeScript errors
- [ ] Bundle size reasonable (warn if > 500kb first load JS)

### Secrets Check
```bash
# Ensure no secrets in code
grep -r "sk_live\|sk_test\|eyJ\|anthropic" --include="*.ts" --exclude-dir=node_modules . | grep -v "process.env\|\.example"
```
- [ ] Zero hardcoded secrets found

### Environment Variables (Vercel)
Required vars — verify all set in Vercel dashboard:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

### Database
```bash
# Check for pending migrations
ls supabase/migrations/ | tail -5
```
- [ ] All migrations applied to production Supabase

### Stripe Webhooks
- [ ] Production webhook endpoint registered: `https://[domain]/api/webhooks/stripe`
- [ ] Webhook secret matches `STRIPE_WEBHOOK_SECRET` in Vercel

## Deploy

```bash
# If using Vercel CLI
vercel --prod

# Or push to main (if auto-deploy configured)
git push origin main
```

After deploy:
1. Test auth flow (sign in/out)
2. Test one agent dispatch end-to-end
3. Check Vercel function logs for errors
4. Verify Stripe webhook receiving events

Report any failures with logs.
