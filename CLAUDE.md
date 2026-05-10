@AGENTS.md

# Crazy Brownies — AI Inventory Command Center

## What this is

A production-ready inventory + AI assistant system for a bakery & chocolate manufacturer (Crazy Brownies Dubai / Crazy Choco). Originally built as a job-application demo, but designed so it can be handed off and run as a real internal tool the day after the recording.

The original brief lives at `../cookies_problem.txt`. Read it once for context. Do not commit it from this repo.

## Status

- **Live deployment:** https://crazy-brownies-inventory.vercel.app (production target on Vercel; pooler region is `aws-1-eu-central-1`). Latest prod deploy: commit `1526e6f` on 2026-05-10.
- **GitHub:** https://github.com/michael-maina1/crazy-brownies-inventory (public)
- **Supabase:** Frankfurt project; schema migrated, RLS active, realtime publication live for `ingredients`/`orders`/`stock_movements`/`ingredient_batches`/`forecasts`/`alerts_log`.
- **Brand recon:** archived in `.cb-recon/SUMMARY.md` (gitignored). Real Crazy Brownies catalog seeded; channels match their actual ops (in-store / website / Deliveroo / corporate).
- **Screens shipped:** Dashboard (8-section layout), Inventory, **Inventory → Receive (new)**, Products, Orders, Suppliers (placeholder), **Alerts (new)**, AI Assistant.
- **Phase-2-lite shipped on 2026-05-10** (was the outreach-demo build): batch tracking, Tier 1 forecast engine + cache + cron, email alerts via Resend, sales simulator endpoint. See "Phase 2 — what was actually built" below before extending. Phases 3+ remain unbuilt and are the paid-engagement pitch.

## Goals (in priority order)

1. **Looks like a real product**, not a tutorial dashboard. Tasteful, calm UI. shadcn defaults beat custom flair.
2. **Domain-true**: ingredients, products, recipes, suppliers reflect a real Dubai bakery (Belgian chocolate, pistachio cream, kunafa, tahini, branded packaging).
3. **The closed loop works**: sale → ingredient deduction → low-stock alert → AI restock recommendation. Demoable on camera in under two minutes.
4. **Production bones**: schema, RLS, validation, types — not throwaway. If hired, day-one work continues from this repo.

## Stack (locked)

- **Framework:** Next.js 16 (App Router, Server Components, Route Handlers, Server Actions where appropriate)
- **Language:** TypeScript, strict mode
- **DB:** Supabase Postgres (Frankfurt region — closest to Dubai)
- **ORM:** Drizzle (schema lives in `src/db/schema.ts`, migrations in `drizzle/`)
- **Auth:** Supabase Auth, roles enforced via Postgres RLS (`owner` / `manager` / `staff`)
- **Realtime:** Supabase Realtime channels for inventory + orders
- **UI:** Tailwind v4 + shadcn/ui (components in `src/components/ui/`)
- **Charts:** Recharts
- **AI:** `@anthropic-ai/sdk` server-side. Model: `claude-sonnet-4-6`. Tool use loop, never raw text-completion of business data.
- **Validation:** Zod at every API/Server-Action boundary
- **Deploy:** Vercel (web) + Supabase (DB) — both have free tiers sufficient for the demo

## Critical Next.js 16 reminders

This repo runs **Next.js 16**, not 15. Some patterns from Next 13–15 are deprecated or changed. Before writing or editing Next.js code, **check `node_modules/next/dist/docs/` for the current API**. Do not pattern-match from training data without verifying. Heed deprecation warnings — they are not optional.

## File structure

```
src/
  app/                        # App Router routes
    (auth)/                   # login, signup
    (app)/                    # protected app shell — sidebar layout
      dashboard/
      inventory/
      products/
      orders/
      assistant/              # Claude chat UI
    api/                      # Route Handlers
      ai/route.ts             # Anthropic tool-use loop
  components/
    ui/                       # shadcn primitives
    app/                      # feature components (KPICard, IngredientTable, etc.)
  db/
    schema.ts                 # Drizzle schema — single source of truth
    client.ts                 # Drizzle client (server-only)
    queries/                  # reusable typed queries used by both server components and AI tools
  lib/
    supabase/
      server.ts               # Supabase server client (cookies-aware)
      browser.ts              # Supabase browser client
      proxy.ts                # auth refresh helper for proxy.ts
    ai/
      tools.ts                # Anthropic tool definitions + handlers
      prompt.ts               # system prompt
    validation/               # zod schemas
  proxy.ts                    # auth gate (Next 16: middleware → proxy rename)
drizzle/                      # generated SQL migrations
seed/                         # seed scripts and CSVs
```

## Domain model

| Table | Purpose |
|---|---|
| `profiles` | one-to-one with `auth.users`, holds `role` (owner/manager/staff) |
| `suppliers` | upstream vendors |
| `ingredients` | raw stock: name, unit (g/kg/ea), current_stock, reorder_threshold, supplier_id, cost_per_unit, **shelf_life_days, is_perishable** |
| `ingredient_batches` | **(Phase 2)** one row per supplier delivery: batch_code, received_at, expires_at, quantity_received, quantity_remaining, cost_fils. Drives the Expiring KPI + freshness UI. FIFO deduction is **not yet** wired into `recordStockMovement` — that's part of the paid Phase-2-full work. |
| `products` | sellable SKUs: name, price_aed, category |
| `recipes` | join table: product_id × ingredient_id × quantity_per_unit (the "1 slab = 400g chocolate" mapping) |
| `orders` | header: created_at, channel (`in_store` / `website` / `deliveroo` / `corporate`), total_fils, customer_note |
| `order_items` | line items: order_id × product_id × qty × unit_price_snapshot |
| `stock_movements` | append-only ledger of every ingredient change (sale-deduct, restock, waste, adjustment). All inventory changes flow through this — never mutate `ingredients.current_stock` without writing a movement. Now carries an optional `batch_id` linking restocks to their `ingredient_batches` row. |
| `forecasts` | **(Phase 2)** daily cache populated by `/api/cron/forecast`. Unique on (product_id, forecast_date, model_version). `drivers` JSONB carries baseline_28d, dow_factor, trend_pct, holiday_boost, holiday_label. |
| `alert_subscriptions` | **(Phase 2)** email + per-event toggles (low_stock / expiring / daily_summary). RLS allows manager+owner to write, anyone authenticated to read. |
| `alerts_log` | **(Phase 2)** append-only log of every dispatched alert with status (sent / queued / failed). 12h dedupe inside `dispatchAlert` keys off (event_type, recipient, subject). |

`stock_movements` as the source of truth is non-negotiable — it makes waste reports, audit trails, and "rewind" features trivial later.

## Conventions

- **Money** is stored as integer **fils** (1 AED = 100 fils) in the DB. Format to AED for display only. Never use floats for money.
- **Quantities** are stored in the ingredient's base unit (grams for solids, ml for liquids, ea for items). Display unit is a UI concern.
- **Server Components by default.** Add `"use client"` only when you need state, effects, or browser APIs.
- **Server Actions** for mutations triggered from forms; **Route Handlers** (`/api/*`) for the AI streaming endpoint and any externally-callable endpoint.
- **Zod at every boundary.** No `any`. No untyped `request.json()`.
- **Inventory mutations always go through a single `recordStockMovement` helper** that writes to `stock_movements` and updates `ingredients.current_stock` in one transaction.
- **AI tools are pure read functions over Drizzle queries.** The assistant never writes to the DB directly — at most it returns a recommendation a user must approve.

## Commands

```bash
npm run dev              # Next dev server
npm run build            # production build
npm run lint             # ESLint
npm run db:generate      # generate Drizzle migration from schema diff
npm run db:migrate       # apply migrations to Supabase
npm run db:seed          # seed bakery data (suppliers, ingredients, products, recipes, 30d orders)
npm run db:apply-sql     # apply hand-rolled migrations in drizzle/sql/* (RLS, channel enum, batches/forecasts/alerts)
npm run db:seed-batches  # seed sample ingredient_batches with realistic expiries
npm run db:forecast      # one-shot populate of the forecasts cache (mirrors /api/cron/forecast)
npm run db:studio        # open Drizzle Studio
```

Order to bring a fresh DB online: `db:push` (or `db:migrate`) → `db:apply-sql` → `db:seed` → `db:seed-batches` → `db:forecast`.

## Environment variables

`.env.local` (never commit):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                 # postgres://... for Drizzle migrations (use the pooler URL on Vercel, direct URL locally)
ANTHROPIC_API_KEY=

# Phase 2 — optional / demo-mode flips
RESEND_API_KEY=               # leave unset and alerts queue in "sandbox mode" (logged, not delivered)
ALERT_FROM_EMAIL=             # default "Crazy Brownies Ops <onboarding@resend.dev>"
CRON_SECRET=                  # if set, /api/cron/* require Authorization: Bearer <secret>
SIMULATOR_ON=                 # "true" enables /api/cron/simulate-orders to drop synthetic orders
```

`.env.example` mirrors these with empty values and ships in git.

## Working agreements

- **Do not invent features past the locked MVP** (dashboard, inventory, products+recipes, orders+auto-deduct, AI assistant). Polish > scope.
- **No comments narrating obvious code.** Comment only when the *why* is non-obvious — RLS subtleties, transactional ordering, etc.
- **No fallback noise** (try/catch around things that can't fail, defensive checks against impossible states). Trust the type system and DB constraints.
- **Test the closed loop on camera-able paths** before marking screens done: log in as staff → record an order → watch dashboard tick down → ask the AI "what's running low?" → see real grounded answer.
- When in doubt about a Next.js 16 API, **read `node_modules/next/dist/docs/`** before writing code.

## Phase 2 — what was actually built (2026-05-10)

A 5-task sprint shipped before the outreach email + screen recording. **All five live in production at https://crazy-brownies-inventory.vercel.app and on `main`.**

### 1. Batch tracking (display layer)
- `ingredient_batches` table + Drizzle schema + RLS policies in `drizzle/sql/003_phase2_demo.sql`.
- `ingredients.shelf_life_days` + `is_perishable` columns with realistic backfill (cream 7d, eggs 21d, butter 30d, pistachio cream 120d, kunafa 150d, chocolate 365d…).
- `freshnessOf(expiresAt, shelfLifeDays)` helper in `src/db/queries/batches.ts` returns `expired | expiring_soon | aging | fresh | unknown`.
- `receiveDelivery()` in `src/lib/stock.ts` — atomic batch insert + stock movement + current_stock update.
- **Not built**: FIFO deduction inside `recordStockMovement`. Stock still deducts from the cached `current_stock` aggregate. The batch table records receives but does **not** drive sale deductions yet. This is the headline Phase-2-full deliverable to pitch in the paid engagement.

### 2. Tier 1 forecasting (`tier1-hw-v1`)
- `src/lib/forecast/engine.ts` — Holt-Winters-flavoured: 28-day baseline × day-of-week multiplier × linear trend × UAE holiday boost. Returns predicted_units + lower/upper bounds + drivers JSON.
- `forecasts` table caches 7 days × all active products. UPSERT-keyed on (product_id, forecast_date, model_version).
- `/api/cron/forecast` runs daily at 02:15 UTC via `vercel.json`. Idempotent.
- `seed/forecast.ts` for one-shot manual regen (uses dynamic import to defer module loading until after dotenv).
- **Engine uses relative imports** (`../../db/client`) instead of `@/` alias because `tsx` doesn't resolve aliases through transitive imports. Don't switch back.
- **Phase-2-full upgrade path** (paid): swap `runForecast()` for a Python/FastAPI service implementing the same `ForecastResult` contract. Add weather, social-trend, multi-location signals.

### 3. Operator alerts
- `src/lib/alerts/dispatch.ts` — Resend HTTP API via `fetch` (no SDK dep). 12h dedupe on (event_type, recipient, subject). Falls into "sandbox mode" with status='queued' if `RESEND_API_KEY` unset.
- `src/lib/alerts/triggers.ts::checkLowStockAlert(ingredientId)` — fires after every `recordStockMovement` (manual adjust) and every line of a recorded sale.
- `/api/cron/expiry-check` — daily 06:00 UTC summary email of batches expiring within 7 days.
- `/alerts` admin page: subscribers CRUD + recent dispatches + "Send test alert" button.

### 4. AI tool extensions
Added to `src/lib/ai/tools.ts`:
- `get_production_plan(product_name?, limit?)` — reads from forecast cache.
- `get_expiring_soon(days)` — batches expiring within N days with AED at risk.
- `get_inventory_at_risk(days)` — single-number rollup.
System prompt updated to prefer `get_production_plan` over `forecast_demand` for tomorrow/weekend questions, and to surface waste risk proactively.

### 5. Live-traffic simulator
- `/api/cron/simulate-orders` drops 1–3 weighted-random synthetic orders through the same write path as a real sale. Bestseller weighting on Pistachio Kunafa / Bueno / 12-Pack.
- Gated by `SIMULATOR_ON=true` env var.
- **Not in `vercel.json` crons** — Hobby plan limits crons to daily. During the demo recording, drive it manually:
  ```bash
  while true; do curl -sS https://crazy-brownies-inventory.vercel.app/api/cron/simulate-orders > /dev/null; sleep 25; done
  ```

### Dashboard restructure
`src/app/(app)/dashboard/page.tsx` now has **4 sections**: 5-up KPI strip (Revenue today / Revenue 30d / Low-stock / **At risk · 7d** / Waste 30d) → Tomorrow's plan + reorder list → Daily revenue chart + Expiring this week → Top products + Recent orders.

The 8-section vision (live alerts banner, channel mix, AI insights feed, time-of-day heatmap) was **scoped out** of the outreach build — earn the engagement first, then build them.

## Roadmap — what to pitch as paid Phase 2+ work

**Do not start any of this without explicit user confirmation.** These are deliberately held back so the outreach demo has a clear "if you hire me, here's what I build next" pitch.

### Phase-2-full (1–2 weeks)
- **FIFO deduction** wired into `recordStockMovement` — cascade through batches oldest-first, write `batch_id` on every sale movement, track per-batch `quantity_remaining` accurately.
- **Product batches** (`product_batches` table) — finished baked goods have their own freshness window (~48h for brownies). Closing-time prediction of unsold inventory.
- **Vision OCR for invoice photos** — `delivery_notes` table + Claude Vision endpoint. Manager photographs supplier WhatsApp delivery note → draft batch row → human approve. The dealcloser feature.
- **WhatsApp alerts via Twilio / WhatsApp Business** — pitch as production-grade replacement for Resend email.
- **Anomaly detection** — z-score on rolling 28-day daily sales per product → "demand spike" alerts in Section 8 of the dashboard.

### Phase 3 (1–2 weeks)
- **Channel adapters** — `/api/ingest/sales/{deliveroo,ecwid,whatsapp}` with per-channel webhook handlers. Each normalises to the existing `RecordSale` event.
- **Talabat / Careem / Noon** as new adapter files when they expand.
- **Production planning module** — kitchen-tablet bake task list driven by `forecasts` cache; one-tap "I baked 38" closes the forecast/actual loop.

### Phase 4 (multi-week)
- **Python/FastAPI forecast service** — Prophet or XGBoost, weather API, multi-location, automated retraining on new POS data, A/B testing of model variants.
- **Multi-location** — schema already supports it (one row per location), UI doesn't.
- **Drains / observability** — Sentry, Better-Stack, drain config to forward errors to a real dashboard. Currently zero drains on the Hobby plan.

## Out-of-scope deliberately

- Per-warehouse multi-location (schema would support, UI doesn't — they're one location)
- Customer accounts (this is an internal tool)
- Custom backup/restore beyond Supabase's daily snapshots
- Vision-based inventory counting (out of phase scope)
