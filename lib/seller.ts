import { ensureDemoDatabase } from "../db/bootstrap";
import { ApiError } from "./api";
import { DEMO_MODE, MARKET_CURRENCY, MARKET_TIMEZONE, type FulfilmentMethod, type ProductStatus, type SellerSummary } from "./types";
import { nowIso, localDateFromNow } from "./time";
import { sellerOrders } from "./orders";

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

export async function sellerDashboard() {
  const database = await ensureDemoDatabase();
  const [rawSeller, orders, productResult, capacityResult, unreadResult] = await Promise.all([
    sellerRow(),
    sellerOrders(MAIN_DEMO_SELLER_ID),
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
      .bind(MAIN_DEMO_SELLER_ID)
      .all<SellerProductRow>(),
    database
      .prepare(
        `SELECT id, date_local, method, window_label, total_capacity, reserved_capacity, committed_capacity
         FROM capacity_slots
         WHERE seller_id = ? AND date_local BETWEEN ? AND ?
         ORDER BY date_local ASC, method ASC`
      )
      .bind(MAIN_DEMO_SELLER_ID, localDateFromNow(0), localDateFromNow(7))
      .all<CapacityRow>(),
    database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM messages m JOIN orders o ON o.id = m.order_id
         WHERE o.seller_id = ? AND m.sender_role = 'buyer' AND m.read_at IS NULL`
      )
      .bind(MAIN_DEMO_SELLER_ID)
      .first<{ count: number }>(),
  ]);

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
      unreadMessages: unreadResult?.count ?? 0,
      payoutPendingCents,
      currency: MARKET_CURRENCY,
    },
    capacity,
    demoMode: DEMO_MODE,
  };
}

export async function updateSellerSettings(input: {
  acceptingNewOrders?: boolean;
  paused?: boolean;
  pausedUntil?: string | null;
}) {
  if (!input || typeof input !== "object") {
    throw new ApiError("INVALID_SETTINGS", "Seller settings must be a JSON object.", 422);
  }
  const database = await ensureDemoDatabase();
  const current = await sellerRow();
  const accepting =
    typeof input.acceptingNewOrders === "boolean"
      ? input.acceptingNewOrders
      : typeof input.paused === "boolean"
        ? !input.paused
        : Boolean(current.accepting_new_orders);
  const pausedUntil = accepting ? null : input.pausedUntil?.trim() || null;
  const status = accepting ? "active" : "paused";
  const now = nowIso();
  await database
    .prepare(
      `UPDATE sellers
       SET accepting_new_orders = ?, paused_until = ?, status = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(accepting ? 1 : 0, pausedUntil, status, now, MAIN_DEMO_SELLER_ID)
    .run();
  const updated = await sellerRow();
  return { seller: mapSeller(updated), demoMode: DEMO_MODE };
}

export async function updateProductStatus(
  id: string,
  input: { status?: "published" | "paused"; published?: boolean }
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
    .bind(status, status, now, now, id, MAIN_DEMO_SELLER_ID)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      "PRODUCT_NOT_FOUND",
      "That product is not part of the main demo seller catalogue.",
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
