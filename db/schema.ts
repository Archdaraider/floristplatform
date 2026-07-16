import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * The MVP deliberately keeps a compact, vertical-slice schema. JSON columns are
 * immutable snapshots or presentation metadata; money and lifecycle fields stay
 * structured so order/capacity invariants can be enforced by the domain layer.
 */
export const sellers = sqliteTable(
  "sellers",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    tradingName: text("trading_name").notNull(),
    legalName: text("legal_name").notNull(),
    uen: text("uen"),
    sellerType: text("seller_type", {
      enum: ["home", "studio", "store"],
    }).notNull(),
    status: text("status", {
      enum: [
        "pending_review",
        "active",
        "paused",
        "restricted",
        "suspended",
      ],
    }).notNull(),
    verificationStatus: text("verification_status", {
      enum: ["pending", "verified", "needs_information"],
    }).notNull(),
    pspReady: integer("psp_ready", { mode: "boolean" }).notNull().default(false),
    acceptingNewOrders: integer("accepting_new_orders", { mode: "boolean" })
      .notNull()
      .default(false),
    pausedUntil: text("paused_until"),
    gstRegistered: integer("gst_registered", { mode: "boolean" })
      .notNull()
      .default(false),
    commissionBps: integer("commission_bps").notNull().default(1500),
    publicStory: text("public_story").notNull(),
    publicArea: text("public_area").notNull(),
    publicAddress: text("public_address"),
    styleTagsJson: text("style_tags_json").notNull().default("[]"),
    fulfilmentMethodsJson: text("fulfilment_methods_json").notNull().default("[]"),
    responseSlaMinutes: integer("response_sla_minutes").notNull().default(60),
    defaultLeadTimeHours: integer("default_lead_time_hours").notNull().default(24),
    ratingHundredths: integer("rating_hundredths").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sellers_slug_unique").on(table.slug),
    uniqueIndex("sellers_uen_unique").on(table.uen),
    index("sellers_status_idx").on(table.status, table.verificationStatus),
    check("sellers_commission_bps_non_negative", sql`${table.commissionBps} >= 0`),
  ]
);

export const deliveryZones = sqliteTable(
  "delivery_zones",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    name: text("name").notNull(),
    postalSectorsJson: text("postal_sectors_json").notNull(),
    feeCents: integer("fee_cents").notNull(),
    windowLabel: text("window_label").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("delivery_zones_seller_enabled_idx").on(table.sellerId, table.enabled),
    check("delivery_zones_fee_non_negative", sql`${table.feeCents} >= 0`),
  ]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status", {
      enum: ["draft", "published", "paused", "archived"],
    }).notNull(),
    basePriceCents: integer("base_price_cents").notNull(),
    currency: text("currency").notNull().default("SGD"),
    occasionTagsJson: text("occasion_tags_json").notNull().default("[]"),
    styleTagsJson: text("style_tags_json").notNull().default("[]"),
    flowerTagsJson: text("flower_tags_json").notNull().default("[]"),
    imageUrl: text("image_url").notNull(),
    imageAlt: text("image_alt").notNull(),
    representativePhotoDisclosure: text("representative_photo_disclosure").notNull(),
    dimensions: text("dimensions").notNull(),
    fulfilmentMethodsJson: text("fulfilment_methods_json").notNull().default("[]"),
    leadTimeHours: integer("lead_time_hours").notNull().default(24),
    policySnapshotJson: text("policy_snapshot_json").notNull(),
    publishedAt: text("published_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_seller_status_idx").on(table.sellerId, table.status),
    check("products_price_non_negative", sql`${table.basePriceCents} >= 0`),
  ]
);

export const capacitySlots = sqliteTable(
  "capacity_slots",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    dateLocal: text("date_local").notNull(),
    method: text("method", { enum: ["pickup", "delivery"] }).notNull(),
    windowLabel: text("window_label").notNull(),
    totalCapacity: integer("total_capacity").notNull(),
    reservedCapacity: integer("reserved_capacity").notNull().default(0),
    committedCapacity: integer("committed_capacity").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("capacity_seller_date_method_unique").on(
      table.sellerId,
      table.dateLocal,
      table.method
    ),
    index("capacity_date_method_idx").on(table.dateLocal, table.method),
    check("capacity_total_non_negative", sql`${table.totalCapacity} >= 0`),
    check("capacity_reserved_non_negative", sql`${table.reservedCapacity} >= 0`),
    check("capacity_committed_non_negative", sql`${table.committedCapacity} >= 0`),
    check(
      "capacity_not_overbooked",
      sql`${table.reservedCapacity} + ${table.committedCapacity} <= ${table.totalCapacity}`
    ),
  ]
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    capacitySlotId: text("capacity_slot_id")
      .notNull()
      .references(() => capacitySlots.id),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    recipientAddress: text("recipient_address"),
    giftMessage: text("gift_message"),
    deliveryInstructions: text("delivery_instructions"),
    commercialStatus: text("commercial_status", {
      enum: ["awaiting_seller", "confirmed", "declined", "completed"],
    }).notNull(),
    operationalStatus: text("operational_status", {
      enum: [
        "awaiting_acceptance",
        "accepted",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "fulfilled",
        "declined",
      ],
    }).notNull(),
    paymentStatus: text("payment_status", {
      enum: ["authorised", "captured", "voided"],
    }).notNull(),
    payoutStatus: text("payout_status", {
      enum: ["not_started", "payout_pending", "payout_available", "paid", "voided"],
    }).notNull(),
    fulfilmentMethod: text("fulfilment_method", {
      enum: ["pickup", "delivery"],
    }).notNull(),
    requestedDateLocal: text("requested_date_local").notNull(),
    timezone: text("timezone").notNull().default("Asia/Singapore"),
    windowLabel: text("window_label").notNull(),
    deliveryPostcode: text("delivery_postcode"),
    quantity: integer("quantity").notNull().default(1),
    subtotalCents: integer("subtotal_cents").notNull(),
    deliveryCents: integer("delivery_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    sellerNetCents: integer("seller_net_cents").notNull(),
    productSnapshotJson: text("product_snapshot_json").notNull(),
    feeSnapshotJson: text("fee_snapshot_json").notNull(),
    policySnapshotJson: text("policy_snapshot_json").notNull(),
    paymentReference: text("payment_reference").notNull(),
    acceptBy: text("accept_by").notNull(),
    acceptedAt: text("accepted_at"),
    completedAt: text("completed_at"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    uniqueIndex("orders_idempotency_key_unique").on(table.idempotencyKey),
    index("orders_seller_status_idx").on(table.sellerId, table.operationalStatus),
    index("orders_accept_by_idx").on(table.commercialStatus, table.acceptBy),
    check("orders_quantity_positive", sql`${table.quantity} > 0`),
    check("orders_subtotal_non_negative", sql`${table.subtotalCents} >= 0`),
    check("orders_delivery_non_negative", sql`${table.deliveryCents} >= 0`),
    check("orders_total_non_negative", sql`${table.totalCents} >= 0`),
  ]
);

export const orderSellerNotes = sqliteTable(
  "order_seller_notes",
  {
    orderId: text("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("order_seller_notes_body_length", sql`length(${table.body}) <= 5000`),
    check("order_seller_notes_version_positive", sql`${table.version} > 0`),
  ]
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    actorRole: text("actor_role", {
      enum: ["buyer", "seller", "support", "system"],
    }).notNull(),
    eventType: text("event_type").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    reason: text("reason"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_events_order_created_idx").on(table.orderId, table.createdAt),
    uniqueIndex("order_events_order_idempotency_key_unique").on(
      table.orderId,
      table.idempotencyKey
    ),
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    senderRole: text("sender_role", {
      enum: ["buyer", "seller", "support", "system"],
    }).notNull(),
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type", {
      enum: ["message", "system"],
    }).notNull(),
    readAt: text("read_at"),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("messages_order_created_idx").on(table.orderId, table.createdAt),
    uniqueIndex("messages_order_idempotency_key_unique").on(
      table.orderId,
      table.idempotencyKey
    ),
    check("messages_body_not_empty", sql`length(${table.body}) > 0`),
  ]
);
