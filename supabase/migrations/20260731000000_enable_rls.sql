-- Row Level Security for all user-facing tables.
-- Without this, the public anon key grants full read/write on every row.

create table if not exists agent_runs (
  id uuid default gen_random_uuid() primary key,
  goal text,
  branch text default 'main',
  version_num int,
  run_message text,
  agents jsonb,
  overseer text,
  score text,
  tokens_used int,
  cost numeric,
  user_email text,
  is_template boolean default false,
  created_at timestamptz default now()
);

create table if not exists templates (
  id uuid default gen_random_uuid() primary key,
  name text,
  description text,
  goal_template text,
  agent_flow jsonb,
  tags text[],
  category text,
  price numeric default 0,
  is_public boolean default true,
  usage_count int default 0,
  creator_email text,
  created_at timestamptz default now()
);

create table if not exists template_purchases (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references templates(id),
  user_id uuid,
  customer_email text,
  amount numeric,
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_email text unique,
  plan text default 'free',
  status text,
  stripe_customer_id text,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

alter table agent_runs         enable row level security;
alter table templates          enable row level security;
alter table template_purchases enable row level security;
alter table subscriptions      enable row level security;

-- agent_runs: owners only, keyed on the email in the access token.
drop policy if exists agent_runs_select_own on agent_runs;
create policy agent_runs_select_own on agent_runs
  for select to authenticated
  using (user_email = auth.jwt() ->> 'email');

drop policy if exists agent_runs_insert_own on agent_runs;
create policy agent_runs_insert_own on agent_runs
  for insert to authenticated
  with check (user_email = auth.jwt() ->> 'email');

drop policy if exists agent_runs_update_own on agent_runs;
create policy agent_runs_update_own on agent_runs
  for update to authenticated
  using (user_email = auth.jwt() ->> 'email')
  with check (user_email = auth.jwt() ->> 'email');

drop policy if exists agent_runs_delete_own on agent_runs;
create policy agent_runs_delete_own on agent_runs
  for delete to authenticated
  using (user_email = auth.jwt() ->> 'email');

-- templates: published templates are world-readable, mutations are owner-only.
drop policy if exists templates_select_public on templates;
create policy templates_select_public on templates
  for select to anon, authenticated
  using (is_public or creator_email = auth.jwt() ->> 'email');

drop policy if exists templates_insert_own on templates;
create policy templates_insert_own on templates
  for insert to authenticated
  with check (creator_email = auth.jwt() ->> 'email');

drop policy if exists templates_update_own on templates;
create policy templates_update_own on templates
  for update to authenticated
  using (creator_email = auth.jwt() ->> 'email')
  with check (creator_email = auth.jwt() ->> 'email');

drop policy if exists templates_delete_own on templates;
create policy templates_delete_own on templates
  for delete to authenticated
  using (creator_email = auth.jwt() ->> 'email');

-- template_purchases / subscriptions: read-only for the owner.
-- Writes happen in the Stripe webhook with the service role, which bypasses RLS.
drop policy if exists template_purchases_select_own on template_purchases;
create policy template_purchases_select_own on template_purchases
  for select to authenticated
  using (user_id = auth.uid() or customer_email = auth.jwt() ->> 'email');

drop policy if exists subscriptions_select_own on subscriptions;
create policy subscriptions_select_own on subscriptions
  for select to authenticated
  using (user_email = auth.jwt() ->> 'email');
