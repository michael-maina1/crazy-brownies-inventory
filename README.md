# Crazy Brownies — AI Inventory Command Center

A production-ready inventory & operations intelligence platform for Crazy Brownies (Dubai). Built as a job-application demo, structured so day-one of real use can pick up from this same repo.

## What it does

- **Real-time inventory** for ingredients (stock, thresholds, suppliers, costs) with append-only `stock_movements` ledger.
- **Auto-deduct on every sale** — recording an order writes ingredient deductions in one transaction. Dashboard, inventory, and KPI cards update live across tabs via Supabase Realtime.
- **Product catalog & recipes** — full Crazy Brownies SKU list with margin calculations.
- **AI Operations Co-Pilot** — Claude Sonnet 4.6 with tool use, grounded in the live database. Forecasts demand, recommends reorders, explains cascades.
- **Role-based access** — Owner / Manager / Staff via Supabase Auth + Postgres Row-Level Security.

## Stack

Next.js 16 · TypeScript · Supabase (Postgres + Auth + Realtime) · Drizzle ORM · Tailwind v4 · shadcn/ui · Recharts · Anthropic SDK · Zod

## Quickstart (local)

```bash
cp .env.example .env.local           # fill in Supabase + Anthropic keys
npm install
npm run db:migrate                   # apply schema
npx tsx seed/apply-sql.ts            # apply RLS + auth trigger + realtime publication
npm run db:seed                      # load real Crazy Brownies catalog + 30 days of orders
npm run dev
```

Then visit http://localhost:3000 — the first user that signs up becomes the **owner**.

## Environment variables

| Var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → "service_role" key (secret) |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (URL-encode `@` in passwords) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys |

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to https://vercel.com/new and import the repo.
3. **Root Directory:** the folder containing this README (Vercel will autodetect Next.js).
4. **Environment Variables:** copy each from your local `.env.local`. For `DATABASE_URL` on Vercel, use the **Transaction pooler** URL (port 6543) instead of the direct URL.
5. Hit Deploy. First build takes ~2 minutes.
6. After deploy, in Supabase → Authentication → URL Configuration, add your Vercel URL to the allowed redirect URLs.

## Repo layout

See `CLAUDE.md` for the full file map and conventions.
