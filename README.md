# Crazy Brownies — AI Inventory Command Center

Production-ready inventory & operations intelligence for [Crazy Brownies](https://www.crazy-brownies.com) (Dubai). Built as a working prototype for the **AI System Developer** role — designed so day-one of real use can pick up from this same repo.

- 🌐 **Live demo:** https://crazy-brownies-inventory.vercel.app
- 📦 **Source:** https://github.com/michael-maina1/crazy-brownies-inventory

## What it does

- **Real-time inventory** for ingredients (stock levels, reorder thresholds, suppliers, costs) with an append-only `stock_movements` ledger so every change is auditable.
- **Ingredient batch tracking** — every supplier delivery is logged as an `ingredient_batches` row with received/expires dates, cost, and supplier. Drives the dashboard's *AED at risk · 7d* tile and the **Receive Delivery** mobile form.
- **Tier 1 demand forecasting** — daily Vercel Cron writes 7-day forecasts to a cache table using Holt-Winters-flavoured stats (28-day baseline × day-of-week × linear trend × UAE holiday boosts including Ramadan, Eid, Mother's Day). Surfaced as *Tomorrow's Production Plan* on the dashboard.
- **Production planning + QR-coded labels** — kitchen staff start a bake from the forecast, ingredients debit live, a `product_batches` row is created with a freshness-driven best-by, and 50×30 mm thermal labels print with QR codes. Customers can scan the printed QR with any phone camera and land on a public best-before page.
- **Auto-deduct on every sale** — recording an order writes ingredient deductions in one transaction. Dashboard, inventory, KPI cards update live across tabs via Supabase Realtime.
- **Operator alerts** — email via Resend (sandbox-mode without a key) when stock crosses thresholds; daily expiry-check cron summarises AED at risk.
- **Real Crazy Brownies catalog** — 15 SKUs (each with a deterministic SKU code) across *Crazy Brownies* and *Crazy Bars* categories, priced exactly as listed on their public store.
- **AI Operations Co-Pilot** — Claude Sonnet 4.6 with tool use, grounded in the live database. 11 tools spanning forecasts, batches, expiry exposure, recipes, top sellers, waste analytics, and reorder recommendations.
- **Role-based access** — Owner / Manager / Staff via Supabase Auth + Postgres Row-Level Security.

## The closed loop (what makes it feel like a real product)

1. Staff opens **Production** → forecast pre-fills tomorrow's plan
2. Tap **Start bake** → ingredients debit live, a `product_batches` row is created with a 48-hour best-by, QR labels print to a connected printer
3. Sticker on tray; customer later scans the QR with their phone camera → lands on the public `/b/<id>` best-before page
4. Staff records a sale on the **Orders** screen → recipe-driven auto-deduction writes a transactional ingredient movement; if a threshold is crossed, an email alert fires via Resend
5. Realtime channels push the change to every open dashboard tab — KPIs, batch counts, ready-stock subtitles update live, no refresh
6. Open the **AI Assistant** and ask "what should we make tomorrow?" or "what's about to expire?" — it grounds its answer in the now-updated state via dedicated tools, no stale RAG

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
| Forecasting | TS-native Holt-Winters in `src/lib/forecast/engine.ts`, daily Vercel Cron, swap-in seam for a Python/FastAPI service later |
| QR labels | `qrcode` server-rendered SVG; `@media print` page sized to 50×30 mm thermal stock |
| Email | Resend HTTP API (no SDK dependency); sandbox mode without a key |
| Validation | Zod at every boundary |
| Hosting | Vercel + Supabase (free tiers cover the demo; ~$25/mo for production) |

## Try it locally

```bash
cp .env.example .env.local           # fill in Supabase + Anthropic keys (see below)
npm install
npm run db:migrate                   # create schema in your Supabase project
npm run db:apply-sql                 # apply RLS, auth trigger, realtime, batches/forecasts/alerts/production
npm run db:seed                      # load real Crazy Brownies catalog + 30 days of orders
npm run db:seed-batches              # seed sample ingredient batches with realistic expiries
npm run db:forecast                  # populate the 7-day forecast cache (one-shot equivalent of the daily cron)
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
| `RESEND_API_KEY` | resend.com → API Keys (optional — leaving unset puts alerts in sandbox-mode: logged but not delivered) |
| `ALERT_FROM_EMAIL` | e.g. `Crazy Brownies Ops <onboarding@resend.dev>` |
| `CRON_SECRET` | optional bearer protecting `/api/cron/*` |
| `SIMULATOR_ON` | `"true"` enables the demo live-traffic endpoint |

## What's shipped (May 2026)

- ✅ **Phase 1** — dashboard, inventory, products+recipes, orders+auto-deduct, AI assistant, role-based auth, Realtime
- ✅ **Phase 2-lite** — `ingredient_batches` schema + Receive Delivery form, daily forecast engine + cache + dashboard widget, Resend-backed email alerts on threshold-cross, sales simulator endpoint
- ✅ **Phase 3-lite (production planning)** — `product_batches` schema, `/production` board with Tomorrow's plan / Baked today / On the shelf, `/production/bake/new` form with live cost preview, `/labels/[id]` print-ready 50×30 mm QR labels, public `/b/[id]` best-before page, Products tab now showing SKU + ready-stock counts

## Roadmap — what comes next as paid Phase-2-full / Phase-3 work

### FIFO sale-time deduction (Path A)
Currently sales deduct ingredients via recipes. The realistic model deducts from `product_batches.quantity_remaining` first (FIFO by oldest expiry); ingredient deduction happens at bake time only. Behind a feature flag with per-product fallthrough so the cutover is zero-downtime.

### Camera scan workflow + PWA
`/scan` page using the native `BarcodeDetector` API (Android Chrome) → action sheet for Mark sold / Mark waste / Adjust. Installable PWA so the kitchen tablet runs without browser chrome. Offline write queue for spotty Wi-Fi.

### Bluetooth thermal direct printing
Today's HTML print works on any system printer. Web Bluetooth + ESC/POS direct integration with XPrinter / Munbyn-class label printers means tapping Start Bake prints labels with no print-dialog click. Android-only (Web Bluetooth doesn't ship on iOS Safari).

### Vision OCR for invoice photos
Manager photographs a supplier WhatsApp delivery note. Claude Vision extracts ingredient name, quantity, batch code, expiry, cost. System proposes a draft batch row; manager taps approve. The biggest data-entry friction in any F&B operation, eliminated.

### WhatsApp Business inbound + outbound
Operator alerts go to the bakery's own WhatsApp number (Twilio for the demo, WhatsApp Business API for production). Supplier confirmations flow back into the system as inbound messages.

### Live channel integrations
Ecwid webhook → website orders auto-flow in. Deliveroo Partner API → live delivery sales. Talabat / Careem / Noon adapters when they expand.

### Python/FastAPI forecast service
The current Tier 1 engine handles single-location forecasting well. Phase 4 swaps the implementation for a Python service implementing the same `ForecastResult` contract — Prophet / XGBoost, weather signals, multi-location, automated retraining.

## Deploy your own

This repo is already configured for Vercel. To deploy a fresh instance:

1. Push your fork to GitHub.
2. Visit https://vercel.com/new and import the repo (root directory = this folder).
3. Set the five env vars above. For `DATABASE_URL` on Vercel, use the **Transaction pooler** URL (port 6543, hostname like `aws-1-eu-central-1.pooler.supabase.com`).
4. Deploy. First build takes ~2 min.
5. After the first deploy, in Supabase → Authentication → URL Configuration, add your Vercel URL to the allowed redirect list.

## Repo layout

See [`CLAUDE.md`](./CLAUDE.md) for the full file map, conventions, and architectural decisions.
