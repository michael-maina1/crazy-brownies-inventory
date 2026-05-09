import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log("tables:", tables.map((t) => t.table_name).join(", "));

  const policies = await sql`
    select count(*)::int as n from pg_policies where schemaname = 'public'
  `;
  console.log("policies:", policies[0].n);

  const trigger = await sql`
    select tgname from pg_trigger where tgname = 'on_auth_user_created'
  `;
  console.log("trigger on_auth_user_created:", trigger.length > 0 ? "present" : "MISSING");

  const realtime = await sql`
    select schemaname, tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
    order by tablename
  `;
  console.log("realtime tables:", realtime.map((r) => r.tablename).join(", "));

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
