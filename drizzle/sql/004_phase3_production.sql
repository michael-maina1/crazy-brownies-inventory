-- Phase-3-lite: production planning slice for the outreach demo.
-- Adds finished-good batch tracking parallel to ingredient_batches. No FIFO
-- deduction wiring on the sale path yet (that's MVP-2 in the engagement).
-- Idempotent (re-runnable).

-- ─── 1. enums ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_batch_status') then
    create type product_batch_status as enum (
      'scheduled', 'baking', 'active', 'depleted', 'expired', 'discarded'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_movement_reason') then
    create type product_movement_reason as enum (
      'bake', 'sale', 'waste', 'transfer', 'adjustment', 'expire'
    );
  end if;
end $$;

-- ─── 2. products: SKU + freshness metadata ───────────────────────────────────
alter table public.products
  add column if not exists sku text,
  add column if not exists freshness_hours integer,
  add column if not exists default_storage_location text,
  add column if not exists default_batch_size integer;

-- Backfill SKUs deterministically: <category-prefix>-<name-slug>-<id-suffix>.
-- The id-suffix is the first 3 chars of md5(id) so disambiguates near-duplicate
-- product names like "Pistachio Kunafa Bar (Milk)" / "(Dark)". Stable across
-- deploys because md5 of the UUID is stable.
update public.products p
set sku = upper(left(regexp_replace(category, '[^A-Za-z0-9]+', '', 'g'), 2))
       || '-' ||
       upper(left(regexp_replace(name, '[^A-Za-z0-9]+', '', 'g'), 8))
       || '-' ||
       upper(substring(md5(id::text) for 3))
where sku is null;

-- Make SKU not-null + unique once backfilled
alter table public.products alter column sku set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_sku_uq'
  ) then
    alter table public.products add constraint products_sku_uq unique (sku);
  end if;
end $$;

-- Backfill freshness windows by category (Crazy Brownies = 48h, Crazy Bars
-- (chocolate) = 14d, Dipped/seasonal = 30d). Idempotent — only sets where null.
update public.products set freshness_hours = 48
  where freshness_hours is null and category ilike '%brownie%';
update public.products set freshness_hours = 336  -- 14 days
  where freshness_hours is null and category ilike '%bar%';
update public.products set freshness_hours = 720  -- 30 days
  where freshness_hours is null and category ilike '%chocolate%';
update public.products set freshness_hours = 168  -- 7 days, safe default
  where freshness_hours is null;

update public.products set default_batch_size = 24
  where default_batch_size is null and category ilike '%brownie%';
update public.products set default_batch_size = 32
  where default_batch_size is null and category ilike '%bar%';
update public.products set default_batch_size = 12
  where default_batch_size is null;

-- ─── 3. product_batches ──────────────────────────────────────────────────────
create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  batch_code text not null,
  baked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  quantity_baked integer not null check (quantity_baked > 0),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  cost_at_bake_fils integer not null default 0,
  status product_batch_status not null default 'active',
  storage_location text,
  forecast_id uuid references public.forecasts(id) on delete set null,
  baked_by uuid,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists product_batches_code_uq
  on public.product_batches(batch_code);
create index if not exists product_batches_product_idx
  on public.product_batches(product_id);
create index if not exists product_batches_status_idx
  on public.product_batches(status);
create index if not exists product_batches_expires_idx
  on public.product_batches(expires_at);

alter table public.product_batches enable row level security;
drop policy if exists "product_batches_read"            on public.product_batches;
drop policy if exists "product_batches_insert_any"      on public.product_batches;
drop policy if exists "product_batches_modify_manager"  on public.product_batches;
create policy "product_batches_read"
  on public.product_batches for select to authenticated using (true);
create policy "product_batches_insert_any"
  on public.product_batches for insert to authenticated with check (true);
create policy "product_batches_modify_manager"
  on public.product_batches for update to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- ─── 4. realtime publication ─────────────────────────────────────────────────
do $$
declare
  t text;
  rt_tables text[] := array['product_batches'];
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

-- ─── 5. SECURITY DEFINER function for the public /b/<id> page ────────────────
-- Exposes only the customer-safe fields. RLS on product_batches stays default-
-- deny for anon; this function is the one and only public surface.
create or replace function public.get_public_batch(p_id uuid)
returns table (
  product_name text,
  category text,
  batch_code text,
  baked_at timestamptz,
  expires_at timestamptz,
  status product_batch_status
)
language sql
security definer
set search_path = public
stable
as $$
  select p.name, p.category, pb.batch_code, pb.baked_at, pb.expires_at, pb.status
  from public.product_batches pb
  join public.products p on p.id = pb.product_id
  where pb.id = p_id
$$;

revoke all on function public.get_public_batch(uuid) from public;
grant execute on function public.get_public_batch(uuid) to anon, authenticated;
