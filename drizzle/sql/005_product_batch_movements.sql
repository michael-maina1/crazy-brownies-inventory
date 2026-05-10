-- Path A: bake-time-only ingredient deduction.
-- Adds the finished-good ledger so sales debit `product_batches.quantity_remaining`
-- instead of double-deducting raw ingredients (which already debited at bake time).
-- Idempotent (re-runnable).

create table if not exists public.product_batch_movements (
  id uuid primary key default gen_random_uuid(),
  product_batch_id uuid not null
    references public.product_batches(id) on delete restrict,
  delta integer not null,
  reason product_movement_reason not null,
  order_id uuid references public.orders(id) on delete set null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists pbm_batch_idx
  on public.product_batch_movements(product_batch_id);
create index if not exists pbm_created_idx
  on public.product_batch_movements(created_at desc);
create index if not exists pbm_order_idx
  on public.product_batch_movements(order_id);

alter table public.product_batch_movements enable row level security;
drop policy if exists "pbm_read"            on public.product_batch_movements;
drop policy if exists "pbm_insert_any"      on public.product_batch_movements;
drop policy if exists "pbm_modify_manager"  on public.product_batch_movements;
create policy "pbm_read"
  on public.product_batch_movements for select to authenticated using (true);
create policy "pbm_insert_any"
  on public.product_batch_movements for insert to authenticated with check (true);
create policy "pbm_modify_manager"
  on public.product_batch_movements for update to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_batch_movements'
  ) then
    alter publication supabase_realtime add table public.product_batch_movements;
  end if;
end $$;
