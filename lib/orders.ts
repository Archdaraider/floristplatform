import { ensureDemoDatabase } from "../db/bootstrap";
import { ApiError } from "./api";
import {
  calculateAvailability,
  findMarketplaceRow,
  mapSellerSummary,
  type MarketplaceRow,
} from "./availability";
import {
  DEMO_MODE,
  MARKET_CURRENCY,
  MARKET_TIMEZONE,
  type CatalogContext,
  type CreateOrderInput,
  type FeeSnapshot,
  type FulfilmentMethod,
  type MessageView,
  type OperationalStatus,
  type OrderAction,
  type OrderDetail,
  type OrderEventView,
  type OrderView,
  type ProductDetail,
  type ProductSnapshot,
  type TransitionOrderInput,
} from "./types";
import { addMinutesIso, isValidLocalDate, nowIso } from "./time";

interface OrderRow {
  id: string;
  order_number: string;
  seller_id: string;
  product_id: string;
  capacity_slot_id: string;
  buyer_name: string;
  buyer_email: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  gift_message: string | null;
  delivery_instructions: string | null;
  commercial_status: OrderView["commercialStatus"];
  operational_status: OperationalStatus;
  payment_status: OrderView["paymentStatus"];
  payout_status: OrderView["payoutStatus"];
  fulfilment_method: FulfilmentMethod;
  requested_date_local: string;
  timezone: typeof MARKET_TIMEZONE;
  window_label: string;
  delivery_postcode: string | null;
  quantity: number;
  subtotal_cents: number;
  delivery_cents: number;
  platform_fee_cents: number;
  tax_cents: number;
  total_cents: number;
  commission_cents: number;
  seller_net_cents: number;
  product_snapshot_json: string;
  fee_snapshot_json: string;
  policy_snapshot_json: string;
  payment_reference: string;
  accept_by: string;
  accepted_at: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  seller_slug: string;
  trading_name: string;
  seller_type: MarketplaceRow["seller_type"];
  seller_status: MarketplaceRow["seller_status"];
  verification_status: MarketplaceRow["verification_status"];
  accepting_new_orders: number;
  paused_until: string | null;
  public_story: string;
  public_area: string;
  public_address: string | null;
  seller_style_tags_json: string;
  seller_methods_json: string;
  response_sla_minutes: number;
  rating_hundredths: number;
  review_count: number;
  gst_registered: number;
  commission_bps: number;
}

interface EventRow {
  id: string;
  order_id: string;
  actor_role: OrderEventView["actorRole"];
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  metadata_json: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  order_id: string;
  sender_role: MessageView["senderRole"];
  sender_name: string;
  body: string;
  message_type: MessageView["messageType"];
  read_at: string | null;
  created_at: string;
}

const ORDER_SELECT = `
SELECT
  o.*,
  s.slug AS seller_slug,
  s.trading_name,
  s.seller_type,
  s.status AS seller_status,
  s.verification_status,
  s.accepting_new_orders,
  s.paused_until,
  s.public_story,
  s.public_area,
  s.public_address,
  s.style_tags_json AS seller_style_tags_json,
  s.fulfilment_methods_json AS seller_methods_json,
  s.response_sla_minutes,
  s.rating_hundredths,
  s.review_count,
  s.gst_registered,
  s.commission_bps
FROM orders o
JOIN sellers s ON s.id = o.seller_id
`;

function objectJson<T extends object>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

function asMarketplaceSellerRow(row: OrderRow): MarketplaceRow {
  return {
    product_id: "",
    product_slug: "",
    product_title: "",
    product_description: "",
    product_status: "published",
    base_price_cents: 0,
    currency: MARKET_CURRENCY,
    occasion_tags_json: "[]",
    product_style_tags_json: "[]",
    flower_tags_json: "[]",
    image_url: "",
    image_alt: "",
    representative_photo_disclosure: "",
    dimensions: "",
    product_methods_json: "[]",
    lead_time_hours: 0,
    policy_snapshot_json: "{}",
    seller_id: row.seller_id,
    seller_slug: row.seller_slug,
    trading_name: row.trading_name,
    seller_type: row.seller_type,
    seller_status: row.seller_status,
    verification_status: row.verification_status,
    accepting_new_orders: row.accepting_new_orders,
    paused_until: row.paused_until,
    public_story: row.public_story,
    public_area: row.public_area,
    public_address: row.public_address,
    seller_style_tags_json: row.seller_style_tags_json,
    seller_methods_json: row.seller_methods_json,
    response_sla_minutes: row.response_sla_minutes,
    rating_hundredths: row.rating_hundredths,
    review_count: row.review_count,
    gst_registered: row.gst_registered,
    commission_bps: row.commission_bps,
    capacity_id: null,
    window_label: null,
    total_capacity: null,
    reserved_capacity: null,
    committed_capacity: null,
    zone_name: null,
    postal_sectors_json: null,
    zone_fee_cents: null,
    zone_window_label: null,
  };
}

export function allowedActions(
  status: OperationalStatus,
  method: FulfilmentMethod
): OrderAction[] {
  switch (status) {
    case "awaiting_acceptance":
      return ["accept", "decline"];
    case "accepted":
      return ["preparing"];
    case "preparing":
      return ["ready"];
    case "ready":
      return method === "delivery" ? ["out_for_delivery"] : ["fulfilled"];
    case "out_for_delivery":
      return ["delivered"];
    case "delivered":
      return ["fulfilled"];
    default:
      return [];
  }
}

function nextAction(row: OrderRow): OrderView["nextAction"] {
  switch (row.operational_status) {
    case "awaiting_acceptance":
      return {
        owner: "seller",
        label: "Florist to accept or decline the request",
        deadline: row.accept_by,
      };
    case "accepted":
      return { owner: "seller", label: "Start preparing the arrangement" };
    case "preparing":
      return { owner: "seller", label: "Mark the arrangement ready" };
    case "ready":
      return {
        owner: "seller",
        label:
          row.fulfilment_method === "delivery"
            ? "Hand the arrangement to the seller’s courier"
            : "Verify collection and mark fulfilled",
      };
    case "out_for_delivery":
      return { owner: "seller", label: "Confirm delivery when the recipient receives it" };
    case "delivered":
      return { owner: "seller", label: "Close the fulfilment and release payout hold" };
    default:
      return { owner: "none", label: "No further action required" };
  }
}

function mapOrder(row: OrderRow, detail = false): OrderView | OrderDetail {
  const base: OrderView = {
    id: row.id,
    orderNumber: row.order_number,
    seller: mapSellerSummary(asMarketplaceSellerRow(row)),
    commercialStatus: row.commercial_status,
    operationalStatus: row.operational_status,
    paymentStatus: row.payment_status,
    payoutStatus: row.payout_status,
    fulfilmentMethod: row.fulfilment_method,
    requestedDate: row.requested_date_local,
    timezone: MARKET_TIMEZONE,
    window: row.window_label,
    ...(row.delivery_postcode ? { deliveryPostcode: row.delivery_postcode } : {}),
    confirmBy: row.accept_by,
    ...(row.accepted_at ? { confirmedAt: row.accepted_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    productSnapshot: objectJson<ProductSnapshot>(row.product_snapshot_json),
    feeSnapshot: objectJson<FeeSnapshot>(row.fee_snapshot_json),
    totals: {
      subtotalCents: row.subtotal_cents,
      deliveryCents: row.delivery_cents,
      platformFeeCents: row.platform_fee_cents,
      taxCents: row.tax_cents,
      totalCents: row.total_cents,
      commissionCents: row.commission_cents,
      sellerNetCents: row.seller_net_cents,
      currency: MARKET_CURRENCY,
    },
    nextAction: nextAction(row),
    allowedActions: allowedActions(row.operational_status, row.fulfilment_method),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (!detail) return base;
  return {
    ...base,
    buyer: { name: row.buyer_name, email: row.buyer_email },
    ...(row.recipient_name || row.recipient_phone || row.recipient_address
      ? {
          recipient: {
            ...(row.recipient_name ? { name: row.recipient_name } : {}),
            ...(row.recipient_phone ? { phone: row.recipient_phone } : {}),
            ...(row.recipient_address ? { address: row.recipient_address } : {}),
          },
        }
      : {}),
    ...(row.gift_message ? { giftMessage: row.gift_message } : {}),
    ...(row.delivery_instructions
      ? { deliveryInstructions: row.delivery_instructions }
      : {}),
    policies: objectJson<ProductDetail["policies"]>(row.policy_snapshot_json),
  };
}

async function orderRowById(id: string): Promise<OrderRow | null> {
  const database = await ensureDemoDatabase();
  return database
    .prepare(`${ORDER_SELECT} WHERE o.id = ? OR o.order_number = ? LIMIT 1`)
    .bind(id, id)
    .first<OrderRow>();
}

async function orderRowByIdempotency(key: string): Promise<OrderRow | null> {
  const database = await ensureDemoDatabase();
  return database
    .prepare(`${ORDER_SELECT} WHERE o.idempotency_key = ? LIMIT 1`)
    .bind(key)
    .first<OrderRow>();
}

export async function getOrderBundle(id: string) {
  const database = await ensureDemoDatabase();
  const row = await orderRowById(id);
  if (!row) throw new ApiError("ORDER_NOT_FOUND", "That order could not be found.", 404);
  const [eventResult, messageResult] = await Promise.all([
    database
      .prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC, id ASC")
      .bind(row.id)
      .all<EventRow>(),
    database
      .prepare("SELECT * FROM messages WHERE order_id = ? ORDER BY created_at ASC, id ASC")
      .bind(row.id)
      .all<MessageRow>(),
  ]);
  const events: OrderEventView[] = eventResult.results.map((event) => ({
    id: event.id,
    orderId: event.order_id,
    actorRole: event.actor_role,
    eventType: event.event_type,
    ...(event.from_state ? { fromState: event.from_state } : {}),
    ...(event.to_state ? { toState: event.to_state } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    metadata: objectJson<Record<string, unknown>>(event.metadata_json),
    createdAt: event.created_at,
  }));
  const messages: MessageView[] = messageResult.results.map((message) => ({
    id: message.id,
    orderId: message.order_id,
    senderRole: message.sender_role,
    senderName: message.sender_name,
    body: message.body,
    messageType: message.message_type,
    ...(message.read_at ? { readAt: message.read_at } : {}),
    createdAt: message.created_at,
  }));
  return { order: mapOrder(row, true) as OrderDetail, events, messages, demoMode: DEMO_MODE };
}

function validateOrderInput(input: CreateOrderInput) {
  if (!input || typeof input !== "object") {
    throw new ApiError("VALIDATION_FAILED", "Checkout details must be a JSON object.", 422);
  }
  const fields: Record<string, string> = {};
  if (!input.productId && !input.productSlug) fields.product = "Choose a product.";
  if (!input.requestedDate || !isValidLocalDate(input.requestedDate)) {
    fields.requestedDate = "Use a valid YYYY-MM-DD date.";
  }
  if (input.fulfilmentMethod !== "pickup" && input.fulfilmentMethod !== "delivery") {
    fields.fulfilmentMethod = "Use pickup or delivery.";
  }
  if (!input.buyer?.name?.trim()) fields["buyer.name"] = "Buyer name is required.";
  if (!/^\S+@\S+\.\S+$/.test(input.buyer?.email?.trim() ?? "")) {
    fields["buyer.email"] = "Enter a valid buyer email.";
  }
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    fields.quantity = "Quantity must be a whole number from 1 to 10.";
  }
  if (input.fulfilmentMethod === "delivery") {
    if (!/^\d{6}$/.test(input.postcode?.replace(/\s/g, "") ?? "")) {
      fields.postcode = "Enter a six-digit Singapore postcode.";
    }
    if (!input.recipient?.address?.trim()) {
      fields["recipient.address"] = "Delivery address is required for seller-managed delivery.";
    }
  }
  if (Object.keys(fields).length) {
    throw new ApiError("VALIDATION_FAILED", "Some checkout details need attention.", 422, false, fields);
  }
}

function orderContext(input: CreateOrderInput): CatalogContext {
  return {
    requestedDate: input.requestedDate,
    method: input.fulfilmentMethod,
    ...(input.fulfilmentMethod === "delivery" && input.postcode
      ? { postcode: input.postcode.replace(/\s/g, "") }
      : {}),
    timezone: MARKET_TIMEZONE,
    queriedAt: nowIso(),
  };
}

function orderNumber(now: string) {
  const date = now.slice(2, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
  return `FL-${date}-${suffix}`;
}

export async function createOrder(input: CreateOrderInput, idempotencyKey: string) {
  validateOrderInput(input);
  const database = await ensureDemoDatabase();
  const existing = await orderRowByIdempotency(idempotencyKey);
  if (existing) {
    return { order: mapOrder(existing, true) as OrderDetail, demoMode: DEMO_MODE };
  }

  const context = orderContext(input);
  const marketplaceRow = await findMarketplaceRow(
    { id: input.productId, slug: input.productSlug },
    context
  );
  if (!marketplaceRow) {
    throw new ApiError("PRODUCT_NOT_FOUND", "That floral design could not be found.", 404);
  }
  const availability = calculateAvailability(marketplaceRow, context);
  const quantity = input.quantity ?? 1;
  if (!availability.bookable || availability.remainingCapacity < quantity) {
    const reasons =
      availability.remainingCapacity < quantity
        ? [...new Set([...availability.reasons, "CAPACITY_FULL" as const])]
        : availability.reasons;
    throw new ApiError(
      reasons[0] ?? "NOT_AVAILABLE",
      "This arrangement is no longer available for the selected date and fulfilment details.",
      409,
      true,
      undefined,
      `Try another date or method. Availability reasons: ${reasons.join(", ")}.`
    );
  }

  if (!marketplaceRow.capacity_id) {
    throw new ApiError("SLOT_UNAVAILABLE", "No capacity slot exists for that date.", 409, true);
  }
  const now = nowIso();
  const id = crypto.randomUUID();
  const number = orderNumber(now);
  const subtotalCents = marketplaceRow.base_price_cents * quantity;
  const deliveryCents = availability.deliveryFeeCents;
  const totalCents = subtotalCents + deliveryCents;
  const commissionCents = Math.round(
    (subtotalCents * marketplaceRow.commission_bps) / 10_000
  );
  const sellerNetCents = totalCents - commissionCents;
  const acceptBy = addMinutesIso(now, marketplaceRow.response_sla_minutes);
  const paymentReference = `demo_auth_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const productSnapshot: ProductSnapshot = {
    productId: marketplaceRow.product_id,
    slug: marketplaceRow.product_slug,
    title: marketplaceRow.product_title,
    imageUrl: marketplaceRow.image_url,
    quantity,
    unitPriceCents: marketplaceRow.base_price_cents,
    sellerName: marketplaceRow.trading_name,
    representativePhotoDisclosure: marketplaceRow.representative_photo_disclosure,
  };
  const feeSnapshot: FeeSnapshot = {
    ...(marketplaceRow.zone_name ? { deliveryZone: marketplaceRow.zone_name } : {}),
    deliveryFeeCents: deliveryCents,
    commissionBps: marketplaceRow.commission_bps,
    gstRegistered: Boolean(marketplaceRow.gst_registered),
    capturedAtCheckout: now,
  };

  const orderColumns = [
    "id",
    "order_number",
    "idempotency_key",
    "seller_id",
    "product_id",
    "capacity_slot_id",
    "buyer_name",
    "buyer_email",
    "recipient_name",
    "recipient_phone",
    "recipient_address",
    "gift_message",
    "delivery_instructions",
    "commercial_status",
    "operational_status",
    "payment_status",
    "payout_status",
    "fulfilment_method",
    "requested_date_local",
    "timezone",
    "window_label",
    "delivery_postcode",
    "quantity",
    "subtotal_cents",
    "delivery_cents",
    "platform_fee_cents",
    "tax_cents",
    "total_cents",
    "commission_cents",
    "seller_net_cents",
    "product_snapshot_json",
    "fee_snapshot_json",
    "policy_snapshot_json",
    "payment_reference",
    "accept_by",
    "version",
    "created_at",
    "updated_at",
  ];
  const orderValues = [
    id,
    number,
    idempotencyKey,
    marketplaceRow.seller_id,
    marketplaceRow.product_id,
    marketplaceRow.capacity_id,
    input.buyer.name.trim(),
    input.buyer.email.trim().toLowerCase(),
    input.recipient?.name?.trim() || null,
    input.recipient?.phone?.trim() || null,
    input.recipient?.address?.trim() || null,
    input.giftMessage?.trim() || null,
    input.deliveryInstructions?.trim() || null,
    "awaiting_seller",
    "awaiting_acceptance",
    "authorised",
    "not_started",
    input.fulfilmentMethod,
    input.requestedDate,
    MARKET_TIMEZONE,
    input.window?.trim() || availability.window || "Scheduled window",
    input.fulfilmentMethod === "delivery"
      ? input.postcode?.replace(/\s/g, "") || null
      : null,
    quantity,
    subtotalCents,
    deliveryCents,
    0,
    0,
    totalCents,
    commissionCents,
    sellerNetCents,
    JSON.stringify(productSnapshot),
    JSON.stringify(feeSnapshot),
    marketplaceRow.policy_snapshot_json,
    paymentReference,
    acceptBy,
    1,
    now,
    now,
  ];
  const placeholders = orderColumns.map(() => "?").join(", ");
  const insertOrder = database
    .prepare(
      `INSERT INTO orders (${orderColumns.join(", ")})
       SELECT ${placeholders}
       FROM capacity_slots
       WHERE id = ? AND total_capacity - reserved_capacity - committed_capacity >= ?`
    )
    .bind(...orderValues, marketplaceRow.capacity_id, quantity);
  const reserveCapacity = database
    .prepare(
      `UPDATE capacity_slots
       SET reserved_capacity = reserved_capacity + ?, version = version + 1, updated_at = ?
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM orders WHERE id = ? AND created_at = ?
       )`
    )
    .bind(quantity, now, marketplaceRow.capacity_id, id, now);
  const insertEvent = database
    .prepare(
      `INSERT INTO order_events
        (id, order_id, actor_role, event_type, from_state, to_state, reason, metadata_json, idempotency_key, created_at)
       SELECT ?, ?, 'system', 'order.awaiting_acceptance', NULL, 'awaiting_acceptance',
              'Payment authorised; awaiting florist confirmation.', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND created_at = ?)`
    )
    .bind(
      crypto.randomUUID(),
      id,
      JSON.stringify({ paymentAuthorization: "simulated", paymentReference }),
      `${idempotencyKey}:created`,
      now,
      id,
      now
    );
  const insertMessage = database
    .prepare(
      `INSERT INTO messages
        (id, order_id, sender_role, sender_name, body, message_type, idempotency_key, created_at)
       SELECT ?, ?, 'system', 'Florist Platform', ?, 'system', ?, ?
       WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND created_at = ?)`
    )
    .bind(
      crypto.randomUUID(),
      id,
      `Payment authorised in demo mode. ${marketplaceRow.trading_name} has until ${acceptBy} to confirm.`,
      `${idempotencyKey}:system-message`,
      now,
      id,
      now
    );

  try {
    const results = await database.batch([
      insertOrder,
      reserveCapacity,
      insertEvent,
      insertMessage,
    ]);
    if ((results[0].meta.changes ?? 0) !== 1) {
      throw new ApiError(
        "CAPACITY_FULL",
        "The final capacity unit was just reserved by another buyer.",
        409,
        true,
        undefined,
        "Refresh availability and choose another date or florist."
      );
    }
  } catch (error) {
    const racedExisting = await orderRowByIdempotency(idempotencyKey);
    if (racedExisting) {
      return { order: mapOrder(racedExisting, true) as OrderDetail, demoMode: DEMO_MODE };
    }
    throw error;
  }

  const created = await orderRowById(id);
  if (!created) throw new ApiError("ORDER_CREATE_FAILED", "The order was not created.", 500, true);
  return { order: mapOrder(created, true) as OrderDetail, demoMode: DEMO_MODE };
}

const ACTION_TARGET: Record<OrderAction, OperationalStatus> = {
  accept: "accepted",
  decline: "declined",
  preparing: "preparing",
  ready: "ready",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  fulfilled: "fulfilled",
};

export async function transitionOrder(
  id: string,
  input: TransitionOrderInput,
  idempotencyKey: string
) {
  const database = await ensureDemoDatabase();
  const row = await orderRowById(id);
  if (!row) throw new ApiError("ORDER_NOT_FOUND", "That order could not be found.", 404);
  if (!input || typeof input !== "object" || !Object.hasOwn(ACTION_TARGET, input.action)) {
    throw new ApiError("INVALID_ACTION", "That order action is not supported.", 422);
  }

  const previousEvent = await database
    .prepare("SELECT id FROM order_events WHERE idempotency_key = ? LIMIT 1")
    .bind(idempotencyKey)
    .first<{ id: string }>();
  if (previousEvent) return getOrderBundle(row.id);

  const available = allowedActions(row.operational_status, row.fulfilment_method);
  if (!available.includes(input.action)) {
    const actionLabel = input.action.replaceAll("_", " ");
    throw new ApiError(
      "INVALID_STATE_TRANSITION",
      `The “${actionLabel}” action is not available while the order is ${row.operational_status.replaceAll("_", " ")}.`,
      409,
      false,
      undefined,
      available.length ? `Allowed actions: ${available.join(", ")}.` : "This order is closed."
    );
  }
  if (input.action === "decline" && !input.reason?.trim()) {
    throw new ApiError(
      "DECLINE_REASON_REQUIRED",
      "A reason is required when declining an order.",
      422,
      false,
      { reason: "Tell the buyer why the florist cannot accept this request." }
    );
  }
  if (input.action === "accept" && new Date(row.accept_by).getTime() < Date.now()) {
    throw new ApiError(
      "ACCEPTANCE_EXPIRED",
      "The seller confirmation window has expired.",
      409,
      false,
      undefined,
      "Decline the request so the simulated authorisation is voided and capacity is released."
    );
  }

  const target = ACTION_TARGET[input.action];
  const now = nowIso();
  const commercialStatus =
    input.action === "accept"
      ? "confirmed"
      : input.action === "decline"
        ? "declined"
        : input.action === "fulfilled"
          ? "completed"
          : row.commercial_status;
  const paymentStatus =
    input.action === "accept"
      ? "captured"
      : input.action === "decline"
        ? "voided"
        : row.payment_status;
  const payoutStatus =
    input.action === "accept"
      ? "payout_pending"
      : input.action === "decline"
        ? "voided"
        : input.action === "fulfilled"
          ? "payout_available"
          : row.payout_status;
  const eventType =
    input.action === "ready"
      ? "fulfilment.ready"
      : input.action === "fulfilled"
        ? "order.completed"
        : input.action === "out_for_delivery"
          ? "fulfilment.in_transit"
          : input.action === "delivered"
            ? "fulfilment.delivered"
            : input.action === "preparing"
              ? "production.preparing"
              : `order.${input.action === "accept" ? "accepted" : "declined"}`;

  const updateOrder = database
    .prepare(
      `UPDATE orders SET
        operational_status = ?, commercial_status = ?, payment_status = ?, payout_status = ?,
        accepted_at = CASE WHEN ? = 'accept' THEN ? ELSE accepted_at END,
        completed_at = CASE WHEN ? = 'fulfilled' THEN ? ELSE completed_at END,
        version = version + 1, updated_at = ?
       WHERE id = ? AND operational_status = ?
         AND (? NOT IN ('accept', 'decline') OR EXISTS (
           SELECT 1 FROM capacity_slots c
           WHERE c.id = orders.capacity_slot_id AND c.reserved_capacity >= orders.quantity
         ))`
    )
    .bind(
      target,
      commercialStatus,
      paymentStatus,
      payoutStatus,
      input.action,
      now,
      input.action,
      now,
      now,
      row.id,
      row.operational_status,
      input.action
    );
  const capacityDelta =
    input.action === "accept"
      ? database
          .prepare(
            `UPDATE capacity_slots SET
              reserved_capacity = reserved_capacity - ?,
              committed_capacity = committed_capacity + ?,
              version = version + 1,
              updated_at = ?
             WHERE id = ? AND reserved_capacity >= ? AND EXISTS (
               SELECT 1 FROM orders WHERE id = ? AND operational_status = ? AND updated_at = ?
             )`
          )
          .bind(
            row.quantity,
            row.quantity,
            now,
            row.capacity_slot_id,
            row.quantity,
            row.id,
            target,
            now
          )
      : input.action === "decline"
        ? database
            .prepare(
              `UPDATE capacity_slots SET
                reserved_capacity = reserved_capacity - ?, version = version + 1, updated_at = ?
               WHERE id = ? AND reserved_capacity >= ? AND EXISTS (
                 SELECT 1 FROM orders WHERE id = ? AND operational_status = ? AND updated_at = ?
               )`
            )
            .bind(
              row.quantity,
              now,
              row.capacity_slot_id,
              row.quantity,
              row.id,
              target,
              now
            )
        : database.prepare("SELECT 1");
  const insertEvent = database
    .prepare(
      `INSERT INTO order_events
        (id, order_id, actor_role, event_type, from_state, to_state, reason, metadata_json, idempotency_key, created_at)
       SELECT ?, ?, 'seller', ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND operational_status = ? AND updated_at = ?)`
    )
    .bind(
      crypto.randomUUID(),
      row.id,
      eventType,
      row.operational_status,
      target,
      input.reason?.trim() || null,
      JSON.stringify({
        paymentAction:
          input.action === "accept"
            ? "simulated_capture"
            : input.action === "decline"
              ? "simulated_void"
              : "none",
        payoutStatus,
      }),
      idempotencyKey,
      now,
      row.id,
      target,
      now
    );
  const insertSystemMessage = database
    .prepare(
      `INSERT INTO messages
        (id, order_id, sender_role, sender_name, body, message_type, idempotency_key, created_at)
       SELECT ?, ?, 'system', 'Florist Platform', ?, 'system', ?, ?
       WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND operational_status = ? AND updated_at = ?)`
    )
    .bind(
      crypto.randomUUID(),
      row.id,
      `Order updated: ${input.action.replaceAll("_", " ")}.`,
      `${idempotencyKey}:message`,
      now,
      row.id,
      target,
      now
    );

  const results = await database.batch([
    updateOrder,
    capacityDelta,
    insertEvent,
    insertSystemMessage,
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ApiError(
      "ORDER_VERSION_CONFLICT",
      "The order changed while this action was being applied.",
      409,
      true,
      undefined,
      "Refresh the order and retry the action."
    );
  }
  return getOrderBundle(row.id);
}

export async function addOrderMessage(
  orderId: string,
  input: { senderRole?: MessageView["senderRole"]; senderName?: string; body?: string },
  idempotencyKey: string
) {
  const database = await ensureDemoDatabase();
  const row = await orderRowById(orderId);
  if (!row) throw new ApiError("ORDER_NOT_FOUND", "That order could not be found.", 404);
  const body = input && typeof input === "object" ? input.body?.trim() ?? "" : "";
  if (!body || body.length > 2_000) {
    throw new ApiError(
      "INVALID_MESSAGE",
      "Message must contain between 1 and 2,000 characters.",
      422,
      false,
      { body: "Enter a message up to 2,000 characters." }
    );
  }
  const senderRole = input.senderRole ?? "buyer";
  if (!(["buyer", "seller", "support"] as string[]).includes(senderRole)) {
    throw new ApiError("INVALID_SENDER", "Sender role must be buyer, seller, or support.", 422);
  }
  const existing = await database
    .prepare("SELECT * FROM messages WHERE idempotency_key = ? LIMIT 1")
    .bind(idempotencyKey)
    .first<MessageRow>();
  if (existing) {
    return {
      message: {
        id: existing.id,
        orderId: existing.order_id,
        senderRole: existing.sender_role,
        senderName: existing.sender_name,
        body: existing.body,
        messageType: existing.message_type,
        ...(existing.read_at ? { readAt: existing.read_at } : {}),
        createdAt: existing.created_at,
      } satisfies MessageView,
      demoMode: DEMO_MODE,
    };
  }
  const id = crypto.randomUUID();
  const now = nowIso();
  const senderName =
    input.senderName?.trim() ||
    (senderRole === "seller" ? row.trading_name : senderRole === "support" ? "Platform support" : row.buyer_name);
  await database
    .prepare(
      `INSERT INTO messages
       (id, order_id, sender_role, sender_name, body, message_type, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, 'message', ?, ?)`
    )
    .bind(id, row.id, senderRole, senderName, body, idempotencyKey, now)
    .run();
  const message: MessageView = {
    id,
    orderId: row.id,
    senderRole,
    senderName,
    body,
    messageType: "message",
    createdAt: now,
  };
  return { message, demoMode: DEMO_MODE };
}

export async function sellerOrders(sellerId: string): Promise<OrderView[]> {
  const database = await ensureDemoDatabase();
  const result = await database
    .prepare(
      `${ORDER_SELECT} WHERE o.seller_id = ?
       ORDER BY CASE WHEN o.operational_status = 'awaiting_acceptance' THEN 0 ELSE 1 END,
                o.accept_by ASC, o.updated_at DESC`
    )
    .bind(sellerId)
    .all<OrderRow>();
  return result.results.map((row) => mapOrder(row) as OrderView);
}
