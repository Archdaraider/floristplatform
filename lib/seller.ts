import { ensureDemoDatabase } from "../db/bootstrap";
import { ApiError } from "./api";
import { reconcileExpiredOrders } from "./order-expiry";
import {
  DEMO_MODE,
  MARKET_CURRENCY,
  MARKET_TIMEZONE,
  type FulfilmentMethod,
  type ProductStatus,
  type SellerSummary,
  type TransitionOrderInput,
} from "./types";
import { nowIso, localDateFromNow } from "./time";
import {
  addOrderMessage,
  getOrderBundle,
  sellerOrders,
  transitionOrder,
} from "./orders";

export const MAIN_DEMO_SELLER_ID = "seller-petal-poem";

interface SellerRow {
  id: string;
  slug: string;
  trading_name: string;
  legal_name: string;
  uen: string | null;
  seller_type: "home" | "studio" | "store";
  status: SellerSummary["status"];
  verification_status: SellerSummary["verificationStatus"];
  psp_ready: number;
  accepting_new_orders: number;
  paused_until: string | null;
  gst_registered: number;
  commission_bps: number;
  public_story: string;
  public_area: string;
  public_address: string | null;
  style_tags_json: string;
  fulfilment_methods_json: string;
  response_sla_minutes: number;
  default_lead_time_hours: number;
  rating_hundredths: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}

interface SellerProductRow {
  id: string;
  slug: string;
  title: string;
  status: ProductStatus;
  base_price_cents: number;
  image_url: string;
  image_alt: string;
  fulfilment_methods_json: string;
  lead_time_hours: number;
  updated_at: string;
  active_order_count: number;
}

interface CapacityRow {
  id: string;
  date_local: string;
  method: FulfilmentMethod;
  window_label: string;
  total_capacity: number;
  reserved_capacity: number;
  committed_capacity: number;
}

interface SellerOrderIdentityRow {
  id: string;
}

interface SellerOrderNoteRow {
  order_id: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface SellerUnreadRow {
  order_id: string;
  count: number;
  last_buyer_message_at: string | null;
}

interface MessageCutoffRow {
  id: string;
  created_at: string;
}

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapSeller(row: SellerRow) {
  return {
    id: row.id,
    slug: row.slug,
    tradingName: row.trading_name,
    sellerType: row.seller_type,
    verificationStatus: row.verification_status,
    status: row.status,
    publicArea: row.public_area,
    // A home seller has no public_address at seed time and cannot acquire one via this API.
    ...(row.seller_type !== "home" && row.public_address
      ? { publicAddress: row.public_address }
      : {}),
    publicStory: row.public_story,
    styleTags: stringArray(row.style_tags_json),
    methods: stringArray(row.fulfilment_methods_json) as FulfilmentMethod[],
    rating: row.rating_hundredths / 100,
    reviewCount: row.review_count,
    acceptingNewOrders: Boolean(row.accepting_new_orders),
    ...(row.paused_until ? { pausedUntil: row.paused_until } : {}),
    pspReady: Boolean(row.psp_ready),
    gstRegistered: Boolean(row.gst_registered),
    commissionBps: row.commission_bps,
    responseSlaMinutes: row.response_sla_minutes,
    defaultLeadTimeHours: row.default_lead_time_hours,
    timezone: MARKET_TIMEZONE,
  };
}

async function sellerRow(id = MAIN_DEMO_SELLER_ID) {
  const database = await ensureDemoDatabase();
  const row = await database
    .prepare("SELECT * FROM sellers WHERE id = ? LIMIT 1")
    .bind(id)
    .first<SellerRow>();
  if (!row) throw new ApiError("SELLER_NOT_FOUND", "The demo seller could not be found.", 404);
  return row;
}

async function sellerOrderId(id: string, sellerId = MAIN_DEMO_SELLER_ID) {
  const database = await ensureDemoDatabase();
  const row = await database
    .prepare(
      `SELECT id
       FROM orders
       WHERE (id = ? OR order_number = ?) AND seller_id = ?
       LIMIT 1`
    )
    .bind(id, id, sellerId)
    .first<SellerOrderIdentityRow>();
  if (!row) {
    throw new ApiError(
      "ORDER_NOT_FOUND",
      "That order is not part of this seller workspace.",
      404
    );
  }
  return row.id;
}

async function sellerOrderNoteRow(orderId: string) {
  const database = await ensureDemoDatabase();
  return database
    .prepare("SELECT * FROM order_seller_notes WHERE order_id = ? LIMIT 1")
    .bind(orderId)
    .first<SellerOrderNoteRow>();
}

function sellerOrderNoteView(row: SellerOrderNoteRow) {
  return {
    orderId: row.order_id,
    body: row.body,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSellerOrderNote(id: string, sellerId = MAIN_DEMO_SELLER_ID) {
  const orderId = await sellerOrderId(id, sellerId);
  const row = await sellerOrderNoteRow(orderId);
  return {
    note: row
      ? sellerOrderNoteView(row)
      : { orderId, body: "", version: 0, createdAt: null, updatedAt: null },
    demoMode: DEMO_MODE,
  };
}

export async function updateSellerOrderNote(
  id: string,
  rawInput: unknown,
  sellerId = MAIN_DEMO_SELLER_ID
) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new ApiError(
      "INVALID_SELLER_NOTE",
      "Seller note must be a JSON object.",
      422,
      false,
      { body: "Enter a note as text." }
    );
  }

  const input = rawInput as Record<string, unknown>;
  if (typeof input.body !== "string") {
    throw new ApiError(
      "INVALID_SELLER_NOTE",
      "Seller note must be text.",
      422,
      false,
      { body: "Enter a note as text." }
    );
  }
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (body.length > 5_000) {
    throw new ApiError(
      "INVALID_SELLER_NOTE",
      "Seller note must be 5,000 characters or fewer.",
      422,
      false,
      { body: "Keep the note to 5,000 characters or fewer." }
    );
  }
  if (
    !Number.isInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 0
  ) {
    throw new ApiError(
      "INVALID_SELLER_NOTE_VERSION",
      "Expected version must be a non-negative integer.",
      422,
      false,
      { expectedVersion: "Use the version returned when the note was loaded." }
    );
  }

  const orderId = await sellerOrderId(id, sellerId);
  const database = await ensureDemoDatabase();
  const current = await sellerOrderNoteRow(orderId);
  const currentVersion = current?.version ?? 0;
  const expectedVersion = Number(input.expectedVersion);

  if (expectedVersion !== currentVersion) {
    if (current?.body === body) {
      return { note: sellerOrderNoteView(current), demoMode: DEMO_MODE };
    }
    throw new ApiError(
      "SELLER_NOTE_VERSION_CONFLICT",
      "A newer private note was saved elsewhere.",
      409,
      false,
      undefined,
      "Reload the latest note before deciding whether to replace it."
    );
  }

  const now = nowIso();
  const result = current
    ? await database
        .prepare(
          `UPDATE order_seller_notes
           SET body = ?, version = version + 1, updated_at = ?
           WHERE order_id = ? AND version = ?`
        )
        .bind(body, now, orderId, currentVersion)
        .run()
    : await database
        .prepare(
          `INSERT OR IGNORE INTO order_seller_notes
           (order_id, body, version, created_at, updated_at)
           VALUES (?, ?, 1, ?, ?)`
        )
        .bind(orderId, body, now, now)
        .run();

  const stored = await sellerOrderNoteRow(orderId);
  if ((result.meta.changes ?? 0) !== 1) {
    if (stored?.body === body) {
      return { note: sellerOrderNoteView(stored), demoMode: DEMO_MODE };
    }
    throw new ApiError(
      "SELLER_NOTE_VERSION_CONFLICT",
      "A newer private note was saved elsewhere.",
      409,
      false,
      undefined,
      "Reload the latest note before deciding whether to replace it."
    );
  }
  if (!stored) {
    throw new ApiError(
      "SELLER_NOTE_NOT_SAVED",
      "The private seller note could not be saved.",
      500,
      true,
      undefined,
      "Retry saving the note."
    );
  }

  return { note: sellerOrderNoteView(stored), demoMode: DEMO_MODE };
}

export async function sellerDashboard(sellerId = MAIN_DEMO_SELLER_ID) {
  await reconcileExpiredOrders();
  const database = await ensureDemoDatabase();
  const [rawSeller, rawOrders, productResult, capacityResult, unreadResult] = await Promise.all([
    sellerRow(sellerId),
    sellerOrders(sellerId),
    database
      .prepare(
        `SELECT p.id, p.slug, p.title, p.status, p.base_price_cents, p.image_url, p.image_alt,
                p.fulfilment_methods_json, p.lead_time_hours, p.updated_at,
                COUNT(CASE WHEN o.commercial_status IN ('awaiting_seller', 'confirmed') THEN 1 END) AS active_order_count
         FROM products p
         LEFT JOIN orders o ON o.product_id = p.id
         WHERE p.seller_id = ?
         GROUP BY p.id
         ORDER BY p.updated_at DESC`
      )
      .bind(sellerId)
      .all<SellerProductRow>(),
    database
      .prepare(
        `SELECT id, date_local, method, window_label, total_capacity, reserved_capacity, committed_capacity
         FROM capacity_slots
         WHERE seller_id = ? AND date_local BETWEEN ? AND ?
         ORDER BY date_local ASC, method ASC`
      )
      .bind(sellerId, localDateFromNow(0), localDateFromNow(6))
      .all<CapacityRow>(),
    database
      .prepare(
        `SELECT o.id AS order_id,
                COUNT(m.id) AS count,
                MAX(m.created_at) AS last_buyer_message_at
         FROM orders o
         LEFT JOIN messages m
           ON m.order_id = o.id
          AND m.sender_role = 'buyer'
          AND m.read_at IS NULL
         WHERE o.seller_id = ?
         GROUP BY o.id`
      )
      .bind(sellerId)
      .all<SellerUnreadRow>(),
  ]);

  const unreadByOrder = new Map(
    unreadResult.results.map((row) => [
      row.order_id,
      {
        count: Number(row.count),
        lastBuyerMessageAt: row.last_buyer_message_at,
      },
    ])
  );
  const orders = rawOrders.map((order) => {
    const unread = unreadByOrder.get(order.id);
    return {
      ...order,
      unreadBuyerMessages: unread?.count ?? 0,
      ...(unread?.lastBuyerMessageAt
        ? { lastBuyerMessageAt: unread.lastBuyerMessageAt }
        : {}),
    };
  });

  const products = productResult.results.map((product) => ({
    id: product.id,
    slug: product.slug,
    title: product.title,
    status: product.status,
    priceCents: product.base_price_cents,
    currency: MARKET_CURRENCY,
    imageUrl: product.image_url,
    imageAlt: product.image_alt,
    methods: stringArray(product.fulfilment_methods_json) as FulfilmentMethod[],
    leadTimeHours: product.lead_time_hours,
    activeOrderCount: product.active_order_count,
    updatedAt: product.updated_at,
  }));
  const capacity = capacityResult.results.map((slot) => ({
    id: slot.id,
    date: slot.date_local,
    method: slot.method,
    window: slot.window_label,
    total: slot.total_capacity,
    reserved: slot.reserved_capacity,
    committed: slot.committed_capacity,
    remaining: Math.max(
      0,
      slot.total_capacity - slot.reserved_capacity - slot.committed_capacity
    ),
  }));
  const activeOrders = orders.filter(
    (order) => !["fulfilled", "declined"].includes(order.operationalStatus)
  );
  const awaitingAcceptance = orders.filter(
    (order) => order.operationalStatus === "awaiting_acceptance"
  );
  const dueToday = orders.filter(
    (order) => order.requestedDate === localDateFromNow(0)
  );
  const payoutPendingCents = orders
    .filter((order) => order.payoutStatus === "payout_pending")
    .reduce((sum, order) => sum + order.totals.sellerNetCents, 0);

  return {
    seller: mapSeller(rawSeller),
    orders,
    products,
    metrics: {
      awaitingAcceptance: awaitingAcceptance.length,
      activeOrders: activeOrders.length,
      dueToday: dueToday.length,
      unreadMessages: orders.reduce(
        (total, order) => total + order.unreadBuyerMessages,
        0
      ),
      payoutPendingCents,
      currency: MARKET_CURRENCY,
    },
    capacity,
    demoMode: DEMO_MODE,
  };
}

export async function updateSellerSettings(
  rawInput: unknown,
  sellerId = MAIN_DEMO_SELLER_ID
) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new ApiError("INVALID_SETTINGS", "Seller settings must be a JSON object.", 422);
  }
  const input = rawInput as Record<string, unknown>;
  if (
    input.acceptingNewOrders !== undefined &&
    typeof input.acceptingNewOrders !== "boolean"
  ) {
    throw new ApiError(
      "INVALID_SETTINGS",
      "Accepting-new-orders must be true or false.",
      422,
      false,
      { acceptingNewOrders: "Use true or false." }
    );
  }
  if (input.paused !== undefined && typeof input.paused !== "boolean") {
    throw new ApiError(
      "INVALID_SETTINGS",
      "Paused must be true or false.",
      422,
      false,
      { paused: "Use true or false." }
    );
  }
  if (
    input.pausedUntil !== undefined &&
    input.pausedUntil !== null &&
    typeof input.pausedUntil !== "string"
  ) {
    throw new ApiError(
      "INVALID_SETTINGS",
      "Pause-until must be an ISO date-time or null.",
      422,
      false,
      { pausedUntil: "Use an ISO date-time or null." }
    );
  }
  if (typeof input.pausedUntil === "string") {
    const pausedUntil = input.pausedUntil.trim();
    if (
      pausedUntil.length > 40 ||
      (pausedUntil &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          pausedUntil
        ) ||
          !Number.isFinite(Date.parse(pausedUntil))))
    ) {
      throw new ApiError(
        "INVALID_SETTINGS",
        "Pause-until must be a valid ISO date-time or null.",
        422,
        false,
        { pausedUntil: "Use a valid ISO date-time or null." }
      );
    }
  }
  const database = await ensureDemoDatabase();
  const current = await sellerRow(sellerId);
  const accepting =
    typeof input.acceptingNewOrders === "boolean"
      ? input.acceptingNewOrders
      : typeof input.paused === "boolean"
        ? !input.paused
        : Boolean(current.accepting_new_orders);
  if (accepting && ["restricted", "suspended"].includes(current.status)) {
    throw new ApiError(
      "SELLER_RESTRICTED",
      "A restricted seller cannot reopen marketplace intake.",
      409,
      false
    );
  }
  const pausedUntil =
    accepting || typeof input.pausedUntil !== "string" ? null : input.pausedUntil.trim() || null;
  const status = ["active", "paused"].includes(current.status)
    ? accepting
      ? "active"
      : "paused"
    : current.status;
  const now = nowIso();
  await database
    .prepare(
      `UPDATE sellers
       SET accepting_new_orders = ?, paused_until = ?, status = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(accepting ? 1 : 0, pausedUntil, status, now, sellerId)
    .run();
  const updated = await sellerRow(sellerId);
  return { seller: mapSeller(updated), demoMode: DEMO_MODE };
}

export async function updateProductStatus(
  id: string,
  input: { status?: "published" | "paused"; published?: boolean },
  sellerId = MAIN_DEMO_SELLER_ID
) {
  const database = await ensureDemoDatabase();
  if (!input || typeof input !== "object") {
    throw new ApiError("INVALID_PRODUCT_STATUS", "Product settings must be a JSON object.", 422);
  }
  const status =
    input.status ??
    (typeof input.published === "boolean" ? (input.published ? "published" : "paused") : undefined);
  if (status !== "published" && status !== "paused") {
    throw new ApiError(
      "INVALID_PRODUCT_STATUS",
      "Product status must be published or paused.",
      422,
      false,
      { status: "Use published or paused." }
    );
  }
  const now = nowIso();
  const result = await database
    .prepare(
      `UPDATE products SET status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END,
       updated_at = ? WHERE id = ? AND seller_id = ? AND status != 'archived'`
    )
    .bind(status, status, now, now, id, sellerId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      "PRODUCT_NOT_FOUND",
      "That product is not part of this seller catalogue.",
      404
    );
  }
  const product = await database
    .prepare(
      `SELECT id, slug, title, status, base_price_cents, image_url, image_alt,
              fulfilment_methods_json, lead_time_hours, updated_at, 0 AS active_order_count
       FROM products WHERE id = ? LIMIT 1`
    )
    .bind(id)
    .first<SellerProductRow>();
  return {
    product: {
      id: product!.id,
      slug: product!.slug,
      title: product!.title,
      status: product!.status,
      priceCents: product!.base_price_cents,
      currency: MARKET_CURRENCY,
      imageUrl: product!.image_url,
      imageAlt: product!.image_alt,
      methods: stringArray(product!.fulfilment_methods_json) as FulfilmentMethod[],
      leadTimeHours: product!.lead_time_hours,
      updatedAt: product!.updated_at,
    },
    demoMode: DEMO_MODE,
  };
}

export async function markSellerOrderMessagesRead(
  id: string,
  rawInput: unknown = {},
  sellerId = MAIN_DEMO_SELLER_ID
) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new ApiError(
      "INVALID_MESSAGE_READ_RECEIPT",
      "Message read details must be a JSON object.",
      422
    );
  }
  const input = rawInput as Record<string, unknown>;
  if (
    input.throughMessageId !== undefined &&
    typeof input.throughMessageId !== "string"
  ) {
    throw new ApiError(
      "INVALID_MESSAGE_READ_RECEIPT",
      "The visible message reference must be text.",
      422,
      false,
      { throughMessageId: "Use the id of the latest visible buyer message." }
    );
  }

  const orderId = await sellerOrderId(id, sellerId);
  const database = await ensureDemoDatabase();
  const throughMessageId =
    typeof input.throughMessageId === "string"
      ? input.throughMessageId.trim()
      : "";
  let cutoff: MessageCutoffRow | null = null;
  if (throughMessageId) {
    cutoff = await database
      .prepare(
        `SELECT id, created_at
         FROM messages
         WHERE id = ? AND order_id = ? AND sender_role = 'buyer'
         LIMIT 1`
      )
      .bind(throughMessageId, orderId)
      .first<MessageCutoffRow>();
    if (!cutoff) {
      throw new ApiError(
        "BUYER_MESSAGE_NOT_FOUND",
        "That buyer message is not part of this seller order.",
        404
      );
    }
  }

  const readAt = nowIso();
  const result = cutoff
    ? await database
        .prepare(
          `UPDATE messages
           SET read_at = ?
           WHERE order_id = ?
             AND sender_role = 'buyer'
             AND read_at IS NULL
             AND (created_at < ? OR (created_at = ? AND id <= ?))`
        )
        .bind(readAt, orderId, cutoff.created_at, cutoff.created_at, cutoff.id)
        .run()
    : await database
        .prepare(
          `UPDATE messages
           SET read_at = ?
           WHERE order_id = ? AND sender_role = 'buyer' AND read_at IS NULL`
        )
        .bind(readAt, orderId)
        .run();

  return {
    orderId,
    markedCount: result.meta.changes ?? 0,
    readAt,
    demoMode: DEMO_MODE,
  };
}

export async function getSellerOrderBundle(
  id: string,
  sellerId = MAIN_DEMO_SELLER_ID
) {
  const orderId = await sellerOrderId(id, sellerId);
  return getOrderBundle(orderId);
}

export async function transitionSellerOrder(
  id: string,
  input: TransitionOrderInput,
  idempotencyKey: string,
  sellerId = MAIN_DEMO_SELLER_ID
) {
  const orderId = await sellerOrderId(id, sellerId);
  return transitionOrder(orderId, input, idempotencyKey);
}

export async function addSellerOrderMessage(
  id: string,
  rawInput: unknown,
  idempotencyKey: string,
  sellerId = MAIN_DEMO_SELLER_ID
) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new ApiError("INVALID_MESSAGE", "Message details must be a JSON object.", 422);
  }
  const orderId = await sellerOrderId(id, sellerId);
  const seller = await sellerRow(sellerId);
  const input = rawInput as Record<string, unknown>;
  return addOrderMessage(
    orderId,
    {
      body: input.body,
      senderRole: "seller",
      senderName: seller.trading_name,
    },
    idempotencyKey
  );
}

export async function allSellerReviewData() {
  const database = await ensureDemoDatabase();
  const result = await database
    .prepare("SELECT * FROM sellers ORDER BY created_at ASC")
    .all<SellerRow>();
  return result.results.map((seller, index) => ({
    id: seller.id,
    tradingName: seller.trading_name,
    sellerType: seller.seller_type,
    publicArea: seller.public_area,
    uenStatus: seller.uen ? "provided" : "review_required",
    verificationStatus: seller.verification_status,
    pspReady: Boolean(seller.psp_ready),
    storefrontStatus: seller.status,
    approvalState: index === 2 ? "renewal_review" : "approved",
    riskFlags: index === 2 ? ["annual_attestation_due"] : [],
    nextAction:
      index === 2 ? "Review updated fulfilment attestation" : "No approval action required",
    submittedAt: seller.created_at,
  }));
}
