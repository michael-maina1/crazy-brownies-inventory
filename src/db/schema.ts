import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ingredients_name_idx").on(t.name)],
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  priceFils: integer("price_fils").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("stock_movements_ingredient_idx").on(t.ingredientId),
    index("stock_movements_created_at_idx").on(t.createdAt),
  ],
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
}));

export const productsRelations = relations(products, ({ many }) => ({
  recipes: many(recipes),
  orderItems: many(orderItems),
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
export type Product = typeof products.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;

// Used in seeds/migrations to silence unused import warnings if we wire raw SQL later.
export const _sql = sql;
