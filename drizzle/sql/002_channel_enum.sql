-- Migrate order_channel enum to reflect actual Crazy Brownies channels.
-- Old: in_store, website, talabat, careem, corporate
-- New: in_store, website, deliveroo, corporate

-- The data in this enum's column is regenerated from scratch by the seed,
-- but be safe in case it's run on a populated DB.
do $$
begin
  if exists (select 1 from pg_type t where t.typname = 'order_channel'
             and not exists (select 1 from pg_enum e
                             where e.enumtypid = t.oid and e.enumlabel = 'deliveroo')) then

    alter type order_channel rename to order_channel_old;

    create type order_channel as enum ('in_store', 'website', 'deliveroo', 'corporate');

    alter table orders alter column channel drop default;
    alter table orders
      alter column channel type order_channel
      using (case channel::text
              when 'talabat' then 'deliveroo'
              when 'careem'  then 'deliveroo'
              else channel::text
             end)::order_channel;
    alter table orders alter column channel set default 'in_store'::order_channel;

    drop type order_channel_old;
  end if;
end $$;
