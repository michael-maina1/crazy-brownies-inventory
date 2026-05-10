import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["owner", "manager", "staff"]);
export const ingredientUnit = pgEnum("ingredient_unit", ["g", "ml", "ea"]);
export const orderChannel = pgEnum("order_channel", [
  "in_store",
  "website",
  "deliveroo",
  "corporate",
]);
export const orderStatus = pgEnum("order_status", ["pending", "fulfilled", "cancelled"]);
export const movementReason = pgEnum("movement_reason", [
  "sale",
  "restock",
  "waste",
  "adjustment",
  "recount",
]);
export const productBatchStatus = pgEnum("product_batch_status", [
  "scheduled",
  "baking",
  "active",
  "depleted",
  "expired",
  "discarded",
]);
export const productMovementReason = pgEnum("product_movement_reason", [
  "bake",
  "sale",
  "waste",
  "transfer",
  "adjustment",
  "expire",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  // 1:1 with auth.users (Supabase) — we do not declare the FK here because auth.users
  // lives in a separate schema. The trigger in 0001_rls.sql keeps them in sync.
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: userRole("role").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    unit: ingredientUnit("unit").notNull(),
    // Stored in the base unit (grams / ml / each). Numeric handles fractions cleanly.
    currentStock: numeric("current_stock", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    reorderThreshold: numeric("reorder_threshold", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    // Fils (1 AED = 100 fils) per base unit. Numeric to support tiny per-gram costs.
    costPerUnitFils: numeric("cost_per_unit_fils", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    // Default shelf life used to project an expiry when receiving a new batch.
    // Per-batch expiry is editable from the invoice. Null = non-perishable / unknown.
    shelfLifeDays: integer("shelf_life_days"),
    isPerishable: boolean("is_perishable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ingredients_name_idx").on(t.name)],
);

// Per-delivery batch tracking. New each time stock is received from a supplier;
// drives expiry/freshness reporting and (in Phase 2 paid work) FIFO deduction.
export const ingredientBatches = pgTable(
  "ingredient_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    batchCode: text("batch_code"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    quantityReceived: numeric("quantity_received", { precision: 12, scale: 3 }).notNull(),
    quantityRemaining: numeric("quantity_remaining", { precision: 12, scale: 3 }).notNull(),
    costFils: numeric("cost_fils", { precision: 14, scale: 4 }).notNull().default("0"),
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ingredient_batches_ingredient_idx").on(t.ingredientId),
    index("ingredient_batches_expires_idx").on(t.expiresAt),
  ],
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  category: text("category").notNull(),
  priceFils: integer("price_fils").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
  // Hours of shelf life from bake time. Drives `expires_at` on each
  // product_batches row. Backfilled by category in 004 migration.
  freshnessHours: integer("freshness_hours"),
  defaultStorageLocation: text("default_storage_location"),
  defaultBatchSize: integer("default_batch_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Finished-good batches — one row per bake event. Mirrors the `ingredient_batches`
// pattern: parent for traceability + freshness + per-batch margin (cost snapshot
// at bake time). Sale-time deduction wiring is paid Phase-2-full work.
export const productBatches = pgTable(
  "product_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batchCode: text("batch_code").notNull().unique(),
    bakedAt: timestamp("baked_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    quantityBaked: integer("quantity_baked").notNull(),
    quantityRemaining: integer("quantity_remaining").notNull(),
    costAtBakeFils: integer("cost_at_bake_fils").notNull().default(0),
    status: productBatchStatus("status").notNull().default("active"),
    storageLocation: text("storage_location"),
    forecastId: uuid("forecast_id").references(() => forecasts.id, { onDelete: "set null" }),
    bakedBy: uuid("baked_by"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_batches_product_idx").on(t.productId),
    index("product_batches_status_idx").on(t.status),
    index("product_batches_expires_idx").on(t.expiresAt),
  ],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    quantityPerUnit: numeric("quantity_per_unit", { precision: 12, scale: 3 }).notNull(),
  },
  (t) => [unique("recipes_product_ingredient_uq").on(t.productId, t.ingredientId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: orderChannel("channel").notNull().default("in_store"),
    totalFils: integer("total_fils").notNull(),
    customerNote: text("customer_note"),
    status: orderStatus("status").notNull().default("fulfilled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [index("orders_created_at_idx").on(t.createdAt)],
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPriceFils: integer("unit_price_fils").notNull(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    // Positive for additions, negative for deductions. Always in ingredient's base unit.
    delta: numeric("delta", { precision: 12, scale: 3 }).notNull(),
    reason: movementReason("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    batchId: uuid("batch_id").references(() => ingredientBatches.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("stock_movements_ingredient_idx").on(t.ingredientId),
    index("stock_movements_created_at_idx").on(t.createdAt),
  ],
);

// Daily forecast cache. Populated by `/api/cron/forecast` once per day.
// One row per (product, date, model_version) — UPSERT-friendly.
export const forecasts = pgTable(
  "forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    forecastDate: date("forecast_date").notNull(),
    predictedUnits: integer("predicted_units").notNull(),
    lowerBound: integer("lower_bound"),
    upperBound: integer("upper_bound"),
    modelVersion: text("model_version").notNull().default("tier1-hw-v1"),
    // Free-form: dow factor, holiday boost, trend slope, sample window, etc.
    drivers: jsonb("drivers"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("forecasts_product_date_version_uq").on(t.productId, t.forecastDate, t.modelVersion),
    index("forecasts_date_idx").on(t.forecastDate),
  ],
);

// Operator alert preferences. Multiple rows allowed per email so different
// people on the team can subscribe to different signals.
export const alertSubscriptions = pgTable("alert_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  label: text("label"),
  eventLowStock: boolean("event_low_stock").notNull().default(true),
  eventExpiring: boolean("event_expiring").notNull().default(true),
  eventDailySummary: boolean("event_daily_summary").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only log of every alert the system has dispatched. Used by the
// dashboard's AI insights feed and for debugging delivery failures.
export const alertsLog = pgTable(
  "alerts_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    status: text("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_log_created_idx").on(t.createdAt)],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  ingredients: many(ingredients),
}));

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [ingredients.supplierId],
    references: [suppliers.id],
  }),
  recipes: many(recipes),
  movements: many(stockMovements),
  batches: many(ingredientBatches),
}));

export const ingredientBatchesRelations = relations(ingredientBatches, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [ingredientBatches.ingredientId],
    references: [ingredients.id],
  }),
  supplier: one(suppliers, {
    fields: [ingredientBatches.supplierId],
    references: [suppliers.id],
  }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  recipes: many(recipes),
  orderItems: many(orderItems),
  forecasts: many(forecasts),
  batches: many(productBatches),
}));

export const productBatchesRelations = relations(productBatches, ({ one, many }) => ({
  product: one(products, { fields: [productBatches.productId], references: [products.id] }),
  forecast: one(forecasts, { fields: [productBatches.forecastId], references: [forecasts.id] }),
  movements: many(productBatchMovements),
}));

// Append-only ledger of every change to a product_batches.quantity_remaining.
// Sale = -qty (with order_id), waste = -qty, expire = -qty (from cron).
// Mirrors the ingredient stock_movements pattern but for finished goods.
export const productBatchMovements = pgTable(
  "product_batch_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productBatchId: uuid("product_batch_id")
      .notNull()
      .references(() => productBatches.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    reason: productMovementReason("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pbm_batch_idx").on(t.productBatchId),
    index("pbm_created_idx").on(t.createdAt),
    index("pbm_order_idx").on(t.orderId),
  ],
);

export const productBatchMovementsRelations = relations(productBatchMovements, ({ one }) => ({
  productBatch: one(productBatches, {
    fields: [productBatchMovements.productBatchId],
    references: [productBatches.id],
  }),
  order: one(orders, { fields: [productBatchMovements.orderId], references: [orders.id] }),
}));

export const forecastsRelations = relations(forecasts, ({ one }) => ({
  product: one(products, { fields: [forecasts.productId], references: [products.id] }),
}));

export const recipesRelations = relations(recipes, ({ one }) => ({
  product: one(products, { fields: [recipes.productId], references: [products.id] }),
  ingredient: one(ingredients, {
    fields: [recipes.ingredientId],
    references: [ingredients.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  movements: many(stockMovements),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [stockMovements.ingredientId],
    references: [ingredients.id],
  }),
  order: one(orders, { fields: [stockMovements.orderId], references: [orders.id] }),
}));

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Profile = typeof profiles.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type IngredientBatch = typeof ingredientBatches.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductBatch = typeof productBatches.$inferSelect;
export type ProductBatchMovement = typeof productBatchMovements.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Forecast = typeof forecasts.$inferSelect;
export type AlertSubscription = typeof alertSubscriptions.$inferSelect;
export type AlertLog = typeof alertsLog.$inferSelect;

// Used in seeds/migrations to silence unused import warnings if we wire raw SQL later.
export const _sql = sql;
