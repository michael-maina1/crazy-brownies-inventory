import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const dir = process.argv[2] ?? "drizzle/sql";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const path = join(dir, file);
    const content = readFileSync(path, "utf8");
    process.stdout.write(`→ ${file} ... `);
    await sql.unsafe(content);
    process.stdout.write("ok\n");
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
