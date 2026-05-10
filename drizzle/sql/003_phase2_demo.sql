-- Phase-2-lite for the outreach demo.
-- Adds: ingredient batch tracking + freshness, forecast cache, operator alert
-- subscriptions, alerts log. Backfills realistic shelf lives on the seeded
-- ingredient catalog.
-- Idempotent (re-runnable).

-- ─── 1. ingredients: shelf-life metadata ─────────────────────────────────────
alter table public.ingredients
  add column if not exists shelf_life_days integer,
  add column if not exists is_perishable boolean not null default false;

-- ─── 2. ingredient_batches ───────────────────────────────────────────────────
create table if not exists public.ingredient_batches (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  batch_code text,
  received_at timestamptz not null default now(),
  expires_at timestamptz,
  quantity_received numeric(12, 3) not null,
  quantity_remaining numeric(12, 3) not null,
  cost_fils numeric(14, 4) not null default 0,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists ingredient_batches_ingredient_idx
  on public.ingredient_batches(ingredient_id);
create index if not exists ingredient_batches_expires_idx
  on public.ingredient_batches(expires_at);

alter table public.ingredient_batches enable row level security;
drop policy if exists "ingredient_batches_read"           on public.ingredient_batches;
drop policy if exists "ingredient_batches_insert_any"     on public.ingredient_batches;
drop policy if exists "ingredient_batches_modify_manager" on public.ingredient_batches;
create policy "ingredient_batches_read"
  on public.ingredient_batches for select to authenticated using (true);
create policy "ingredient_batches_insert_any"
  on public.ingredient_batches for insert to authenticated with check (true);
create policy "ingredient_batches_modify_manager"
  on public.ingredient_batches for update to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- ─── 3. stock_movements: link to batch (FIFO bookkeeping) ────────────────────
alter table public.stock_movements
  add column if not exists batch_id uuid references public.ingredient_batches(id)
    on delete set null;

-- ─── 4. forecasts cache ──────────────────────────────────────────────────────
create table if not exists public.forecasts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  forecast_date date not null,
  predicted_units integer not null,
  lower_bound integer,
  upper_bound integer,
  model_version text not null default 'tier1-hw-v1',
  drivers jsonb,
  generated_at timestamptz not null default now(),
  unique (product_id, forecast_date, model_version)
);

create index if not exists forecasts_date_idx on public.forecasts(forecast_date);

alter table public.forecasts enable row level security;
drop policy if exists "forecasts_read"          on public.forecasts;
drop policy if exists "forecasts_write_manager" on public.forecasts;
create policy "forecasts_read"
  on public.forecasts for select to authenticated using (true);
create policy "forecasts_write_manager"
  on public.forecasts for all to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- ─── 5. alert_subscriptions ──────────────────────────────────────────────────
create table if not exists public.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  label text,
  event_low_stock boolean not null default true,
  event_expiring boolean not null default true,
  event_daily_summary boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.alert_subscriptions enable row level security;
drop policy if exists "alert_subscriptions_read"          on public.alert_subscriptions;
drop policy if exists "alert_subscriptions_write_manager" on public.alert_subscriptions;
create policy "alert_subscriptions_read"
  on public.alert_subscriptions for select to authenticated using (true);
create policy "alert_subscriptions_write_manager"
  on public.alert_subscriptions for all to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- ─── 6. alerts_log ───────────────────────────────────────────────────────────
create table if not exists public.alerts_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  subject text not null,
  body_text text not null,
  recipient_email text not null,
  status text not null default 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists alerts_log_created_idx on public.alerts_log(created_at desc);

alter table public.alerts_log enable row level security;
drop policy if exists "alerts_log_read"          on public.alerts_log;
drop policy if exists "alerts_log_write_manager" on public.alerts_log;
create policy "alerts_log_read"
  on public.alerts_log for select to authenticated using (true);
create policy "alerts_log_write_manager"
  on public.alerts_log for all to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- ─── 7. realtime publication for new tables ──────────────────────────────────
do $$
declare
  t text;
  rt_tables text[] := array['ingredient_batches','forecasts','alerts_log'];
begin
  foreach t in array rt_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─── 8. shelf-life backfill on seeded catalog ────────────────────────────────
-- Realistic numbers for a Dubai bakery's pantry. All updates idempotent.
update public.ingredients set shelf_life_days = 7,   is_perishable = true
  where lower(name) like '%heavy cream%';
update public.ingredients set shelf_life_days = 21,  is_perishable = true
  where lower(name) like '%egg%';
update public.ingredients set shelf_life_days = 30,  is_perishable = true
  where lower(name) like '%butter%';
update public.ingredients set shelf_life_days = 120, is_perishable = true
  where lower(name) = 'pistachio cream';
update public.ingredients set shelf_life_days = 150, is_perishable = true
  where lower(name) like '%kunafa%';
update public.ingredients set shelf_life_days = 90,  is_perishable = true
  where lower(name) like '%tahini%';
update public.ingredients set shelf_life_days = 90,  is_perishable = true
  where lower(name) like '%biscoff%';
update public.ingredients set shelf_life_days = 365
  where lower(name) like '%chocolate%' or lower(name) like '%cocoa%';
update public.ingredients set shelf_life_days = 270
  where lower(name) like '%hazelnut praline%';
update public.ingredients set shelf_life_days = 180
  where lower(name) like '%marshmallow%' or lower(name) like '%puffed rice%';
update public.ingredients set shelf_life_days = 365
  where lower(name) like '%flour%' or lower(name) like '%sugar%' or lower(name) like '%walnut%';
update public.ingredients set shelf_life_days = 730
  where lower(name) like '%vanilla%' or lower(name) like '%sea salt%';
-- packaging is non-perishable; leave shelf_life_days null
