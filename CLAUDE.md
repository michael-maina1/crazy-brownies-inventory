@AGENTS.md

# Crazy Brownies — AI Inventory Command Center

## What this is

A production-ready inventory + AI assistant system for a bakery & chocolate manufacturer (Crazy Brownies Dubai / Crazy Choco). Originally built as a job-application demo, but designed so it can be handed off and run as a real internal tool the day after the recording.

The original brief lives at `../cookies_problem.txt`. Read it once for context. Do not commit it from this repo.

## Status

- **Live deployment:** https://crazy-brownies-inventory.vercel.app (production target on Vercel; pooler region is `aws-1-eu-central-1`)
- **GitHub:** https://github.com/michael-maina1/crazy-brownies-inventory (public)
- **Supabase:** Frankfurt project; schema migrated, RLS active, realtime publication live for `ingredients`/`orders`/`stock_movements`
- **Brand recon:** archived in `.cb-recon/SUMMARY.md` (gitignored). Real Crazy Brownies catalog seeded; channels match their actual ops (in-store / website / Deliveroo / corporate).
- **MVP screens shipped:** Dashboard, Inventory, Products, Orders, Suppliers (placeholder), AI Assistant.

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
| `ingredients` | raw stock: name, unit (g/kg/ea), current_stock, reorder_threshold, supplier_id, cost_per_unit |
| `products` | sellable SKUs: name, price_aed, category |
| `recipes` | join table: product_id × ingredient_id × quantity_per_unit (the "1 slab = 400g chocolate" mapping) |
| `orders` | header: created_at, channel (`in_store` / `website` / `deliveroo` / `corporate`), total_fils, customer_note |
| `order_items` | line items: order_id × product_id × qty × unit_price_snapshot |
| `stock_movements` | append-only ledger of every ingredient change (sale-deduct, restock, waste, adjustment). All inventory changes flow through this — never mutate `ingredients.current_stock` without writing a movement |

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
npm run dev          # Next dev server
npm run build        # production build
npm run lint         # ESLint
npm run db:generate  # generate Drizzle migration from schema diff
npm run db:migrate   # apply migrations to Supabase
npm run db:seed      # seed bakery data
npm run db:studio    # open Drizzle Studio
```

## Environment variables

`.env.local` (never commit):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                 # postgres://... for Drizzle migrations (use the pooler URL on Vercel, direct URL locally)
ANTHROPIC_API_KEY=
```

`.env.example` mirrors these with empty values and ships in git.

## Working agreements

- **Do not invent features past the locked MVP** (dashboard, inventory, products+recipes, orders+auto-deduct, AI assistant). Polish > scope.
- **No comments narrating obvious code.** Comment only when the *why* is non-obvious — RLS subtleties, transactional ordering, etc.
- **No fallback noise** (try/catch around things that can't fail, defensive checks against impossible states). Trust the type system and DB constraints.
- **Test the closed loop on camera-able paths** before marking screens done: log in as staff → record an order → watch dashboard tick down → ask the AI "what's running low?" → see real grounded answer.
- When in doubt about a Next.js 16 API, **read `node_modules/next/dist/docs/`** before writing code.

## Roadmap (decided, not yet built)

The MVP demonstrates ~85% of the JD. The remaining 15% is two depth features. The user paused on 2026-05-09 to sleep on whether to build them before recording the demo. **Do not start either of these without explicit user confirmation.**

### Phase 2 — Batch + expiry tracking (next, recommended)

Real F&B waste is expiry-driven, not loss-driven. Current `stock_movements` records waste *events* but not *risk*. Adding lot/batch tracking unlocks the most expensive form of waste detection.

Proposed schema add:

```ts
ingredient_batches {
  id, ingredient_id, batch_code, supplier_id, invoice_ref,
  received_at, expires_at,
  quantity_received, quantity_remaining,
  cost_fils
}
```

Required changes:
- `recordStockMovement` becomes FIFO-aware — deduct from oldest non-expired batch first; cascade to next batch if first is depleted.
- Seed needs realistic shelf lives per ingredient (chocolate 12mo, pistachio cream 4mo, kunafa 5mo, butter 30d, **cream 7d**, **eggs 21d**, lotus 9mo).
- New AI tools: `get_expiring_soon(days)`, `recommend_promotion_to_avoid_waste`.
- Dashboard panel: "Expiring this week" with AED-at-risk total.
- Inventory drawer: per-ingredient batch list with received/expires/remaining columns.

Effort: ~2–3 hrs focused.

### Phase 3 — AI invoice ingestion (held as outreach teaser, not built)

Manager photographs a supplier WhatsApp delivery note. Claude vision (`messages.create` with `image` content blocks) extracts ingredient name, quantity, batch code, expiry date, cost. System proposes a draft restock movement; manager taps approve. Killer because every F&B owner re-types delivery notes from photos every day.

**Decision:** show this as a 30-second concept moment in the recorded demo ("here's what I'd build first if you bring me on") rather than building it. Leaves room to be hired to do the work, not just shown the work.

### Phases 4+ — Channel integrations

Ecwid webhook → website orders auto-flow in. Deliveroo Partner API → live delivery channel sales. WhatsApp Business webhook → supplier confirmation messages. Out of scope for the demo; mention in outreach as the integration path.

## Out-of-scope deliberately

- Per-warehouse multi-location (schema would support, UI doesn't — they're one location)
- Customer accounts (this is an internal tool)
- Custom backup/restore beyond Supabase's daily snapshots
- Vision-based inventory counting (out of phase scope)
