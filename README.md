# Crazy Brownies — AI Inventory Command Center

Production-ready inventory & operations intelligence for [Crazy Brownies](https://www.crazy-brownies.com) (Dubai). Built as a working prototype for the **AI System Developer** role — designed so day-one of real use can pick up from this same repo.

- 🌐 **Live demo:** https://crazy-brownies-inventory.vercel.app
- 📦 **Source:** https://github.com/michael-maina1/crazy-brownies-inventory

## What it does

- **Real-time inventory** for ingredients (stock levels, reorder thresholds, suppliers, costs) with an append-only `stock_movements` ledger so every change is auditable.
- **Auto-deduct on every sale** — recording an order writes ingredient deductions in one transaction. Dashboard, inventory, KPI cards update live across tabs via Supabase Realtime.
- **Real Crazy Brownies catalog** — 15 SKUs across *Crazy Brownies* and *Crazy Bars* categories, priced exactly as listed on their public store (recon'd from crazy-brownies.com).
- **AI Operations Co-Pilot** — Claude Sonnet 4.6 with tool use, grounded in the live database. Forecasts demand, recommends reorders, explains cascading inventory pressure ("if pistachio cream runs out, here's the revenue impact").
- **Role-based access** — Owner / Manager / Staff via Supabase Auth + Postgres Row-Level Security.

## The closed loop (what makes it feel like a real product)

1. Staff records a sale on the **Orders** screen
2. Recipe-driven auto-deduction writes a transactional ingredient movement
3. Realtime channels push the change to every open dashboard tab — KPIs and stock list update live, no refresh
4. Open the **AI Assistant** and ask "what should we reorder today?" — it grounds its answer in the now-updated state, no stale RAG

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Route Handlers) |
| Language | TypeScript, strict |
| Database | Supabase Postgres (Frankfurt — closest to Dubai) |
| ORM | Drizzle (typed migrations, FIFO-ready transactional writes) |
| Auth | Supabase Auth + Postgres RLS, three roles |
| Realtime | Supabase Realtime channels (no polling) |
| UI | Tailwind v4 + shadcn/ui + Recharts |
| AI | `@anthropic-ai/sdk` server-side, Claude Sonnet 4.6 with tool use + prompt caching |
| Validation | Zod at every boundary |
| Hosting | Vercel + Supabase (free tiers cover the demo; ~$25/mo for production) |

## Try it locally

```bash
cp .env.example .env.local           # fill in Supabase + Anthropic keys (see below)
npm install
npm run db:migrate                   # create schema in your Supabase project
npx tsx seed/apply-sql.ts            # apply RLS, auth trigger, realtime publication
npm run db:seed                      # load real Crazy Brownies catalog + 30 days of orders
npm run dev
```

Then open http://localhost:3000 — the **first user that signs up becomes the owner**.

## Environment variables

| Var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → "service_role" key (secret) |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string. Local: Direct connection. Vercel: **Transaction pooler** (port 6543). URL-encode special chars in your password. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys |

## Roadmap

The current build covers ~85% of the AI System Developer JD. Two depth features come next:

### Phase 2 — Batch + expiry tracking
Real F&B waste isn't theft, it's expiry. Adding `ingredient_batches` with FIFO deduction unlocks waste detection that the current ledger structurally cannot do:

> *"Pistachio cream batch BC-04A2 expires in 4 days, 2.3 kg remaining. At your current 1.1 kg/week burn rate, AED 28 of waste at risk. Recommendation: push the Viral Pistachio Kunafa Bar through Deliveroo for the next 4 days."*

### Phase 3 — AI invoice ingestion
The owner photographs a supplier WhatsApp delivery note. Claude vision extracts ingredient name, quantity, batch code, expiry date, cost. System proposes a draft restock movement; manager taps approve. The single biggest data-ingestion friction in any F&B operation, eliminated.

### Phase 4 — Live channel integrations
Ecwid webhook → website orders auto-flow in. Deliveroo Partner API → live delivery channel sales. WhatsApp Business webhook → supplier confirmation messages. Eliminates dual-entry across the existing tools the team already lives in.

## Deploy your own

This repo is already configured for Vercel. To deploy a fresh instance:

1. Push your fork to GitHub.
2. Visit https://vercel.com/new and import the repo (root directory = this folder).
3. Set the five env vars above. For `DATABASE_URL` on Vercel, use the **Transaction pooler** URL (port 6543, hostname like `aws-1-eu-central-1.pooler.supabase.com`).
4. Deploy. First build takes ~2 min.
5. After the first deploy, in Supabase → Authentication → URL Configuration, add your Vercel URL to the allowed redirect list.

## Repo layout

See [`CLAUDE.md`](./CLAUDE.md) for the full file map, conventions, and architectural decisions.
