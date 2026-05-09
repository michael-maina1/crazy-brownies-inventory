-- Run AFTER `npm run db:push` to add Supabase Auth integration + RLS.
-- Re-runnable: each statement is idempotent.

-- ─── 1. profiles ↔ auth.users sync trigger ───────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    -- The very first user becomes the owner; everyone else defaults to staff.
    case when (select count(*) from public.profiles) = 0 then 'owner'::user_role
         else 'staff'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. role helper ──────────────────────────────────────────────────────────

create or replace function public.user_role()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ─── 3. enable RLS on all tables ─────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.suppliers        enable row level security;
alter table public.ingredients      enable row level security;
alter table public.products         enable row level security;
alter table public.recipes          enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stock_movements  enable row level security;

-- ─── 4. policies ─────────────────────────────────────────────────────────────
-- Strategy: all authenticated staff can read everything (this is an internal
-- bakery tool). Writes are gated by role.
--   owner   → full access
--   manager → full access except managing other users' roles
--   staff   → can record sales (orders, order_items, stock_movements w/ reason='sale'),
--             cannot edit ingredients/products/recipes/suppliers.

-- profiles: each user can read all profiles; only owner can change roles
drop policy if exists "profiles_read_all"       on public.profiles;
drop policy if exists "profiles_update_self"    on public.profiles;
drop policy if exists "profiles_owner_all"      on public.profiles;
create policy "profiles_read_all"    on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "profiles_owner_all"   on public.profiles for all to authenticated
  using (public.user_role() = 'owner') with check (public.user_role() = 'owner');

-- helper: read-all-write-manager-or-owner pattern
do $$
declare
  t text;
  read_tables text[] := array['suppliers','ingredients','products','recipes'];
begin
  foreach t in array read_tables loop
    execute format('drop policy if exists "%1$s_read"          on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_write_manager" on public.%1$s;', t);
    execute format('create policy "%1$s_read" on public.%1$s for select to authenticated using (true);', t);
    execute format($f$create policy "%1$s_write_manager" on public.%1$s for all to authenticated
      using (public.user_role() in ('owner','manager'))
      with check (public.user_role() in ('owner','manager'));$f$, t);
  end loop;
end $$;

-- orders + order_items + stock_movements: any authenticated user can insert (record sales);
-- updates/deletes restricted to manager/owner.
drop policy if exists "orders_read"           on public.orders;
drop policy if exists "orders_insert_any"     on public.orders;
drop policy if exists "orders_modify_manager" on public.orders;
create policy "orders_read"           on public.orders for select to authenticated using (true);
create policy "orders_insert_any"     on public.orders for insert to authenticated with check (true);
create policy "orders_modify_manager" on public.orders for update to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

drop policy if exists "order_items_read"           on public.order_items;
drop policy if exists "order_items_insert_any"     on public.order_items;
drop policy if exists "order_items_modify_manager" on public.order_items;
create policy "order_items_read"           on public.order_items for select to authenticated using (true);
create policy "order_items_insert_any"     on public.order_items for insert to authenticated with check (true);
create policy "order_items_modify_manager" on public.order_items for update to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

drop policy if exists "stock_movements_read"           on public.stock_movements;
drop policy if exists "stock_movements_insert_any"     on public.stock_movements;
drop policy if exists "stock_movements_modify_manager" on public.stock_movements;
create policy "stock_movements_read"           on public.stock_movements for select to authenticated using (true);
create policy "stock_movements_insert_any"     on public.stock_movements for insert to authenticated with check (true);
create policy "stock_movements_modify_manager" on public.stock_movements for update to authenticated
  using (public.user_role() in ('owner','manager'))
  with check (public.user_role() in ('owner','manager'));

-- ─── 5. realtime publication ─────────────────────────────────────────────────
-- Subscribe-able from the browser for live stock + order ticker. Idempotent.
do $$
declare
  t text;
  rt_tables text[] := array['ingredients','orders','stock_movements'];
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
