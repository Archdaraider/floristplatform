import { ensureDemoDatabase } from "../db/bootstrap";
import { allSellerReviewData } from "./seller";
import { DEMO_MODE, MARKET_CURRENCY } from "./types";
import { addMinutesIso, nowIso } from "./time";

interface MetricsRow {
  active_sellers: number;
  live_products: number;
  open_orders: number;
  authorised_gmv_cents: number;
  captured_gmv_cents: number;
  pending_payout_cents: number;
}

interface ExceptionRow {
  id: string;
  order_number: string;
  trading_name: string;
  operational_status: string;
  payment_status: string;
  accept_by: string;
  requested_date_local: string;
  updated_at: string;
}

interface RecentEventRow {
  id: string;
  order_id: string;
  order_number: string;
  trading_name: string;
  actor_role: "buyer" | "seller" | "support" | "system";
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  created_at: string;
}

export async function adminDashboard() {
  const database = await ensureDemoDatabase();
  const now = nowIso();
  const [metrics, sellerReviews, exceptionResult, eventResult] = await Promise.all([
    database
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM sellers WHERE status = 'active') AS active_sellers,
          (SELECT COUNT(*) FROM products WHERE status = 'published') AS live_products,
          (SELECT COUNT(*) FROM orders WHERE operational_status NOT IN ('fulfilled', 'declined')) AS open_orders,
          (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE payment_status = 'authorised') AS authorised_gmv_cents,
          (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE payment_status = 'captured') AS captured_gmv_cents,
          (SELECT COALESCE(SUM(seller_net_cents), 0) FROM orders WHERE payout_status = 'payout_pending') AS pending_payout_cents`
      )
      .first<MetricsRow>(),
    allSellerReviewData(),
    database
      .prepare(
        `SELECT o.id, o.order_number, s.trading_name, o.operational_status,
                o.payment_status, o.accept_by, o.requested_date_local, o.updated_at
         FROM orders o JOIN sellers s ON s.id = o.seller_id
         WHERE (o.operational_status = 'awaiting_acceptance' AND o.accept_by <= ?)
            OR (o.operational_status IN ('preparing', 'ready') AND o.requested_date_local <= date('now', '+1 day'))
         ORDER BY o.accept_by ASC, o.updated_at ASC`
      )
      .bind(addMinutesIso(now, 30))
      .all<ExceptionRow>(),
    database
      .prepare(
        `SELECT e.id, e.order_id, o.order_number, s.trading_name, e.actor_role,
                e.event_type, e.from_state, e.to_state, e.reason, e.created_at
         FROM order_events e
         JOIN orders o ON o.id = e.order_id
         JOIN sellers s ON s.id = o.seller_id
         ORDER BY e.created_at DESC, e.id DESC LIMIT 12`
      )
      .all<RecentEventRow>(),
  ]);

  const exceptions = exceptionResult.results.map((item) => {
    const acceptanceRisk = item.operational_status === "awaiting_acceptance";
    const overdue = acceptanceRisk && new Date(item.accept_by).getTime() < Date.now();
    return {
      id: `exception:${item.id}:${acceptanceRisk ? "acceptance" : "fulfilment"}`,
      orderId: item.id,
      orderNumber: item.order_number,
      sellerName: item.trading_name,
      type: acceptanceRisk ? "acceptance_deadline" : "fulfilment_due",
      severity: overdue ? "high" : acceptanceRisk ? "medium" : "low",
      status: "open",
      owner: acceptanceRisk ? "seller_success" : "support",
      deadline: acceptanceRisk ? item.accept_by : item.requested_date_local,
      summary: overdue
        ? "Seller confirmation SLA has expired; authorisation should be voided."
        : acceptanceRisk
          ? "Seller confirmation is due within 30 minutes."
          : "Fulfilment is due within the next day; monitor readiness.",
      paymentStatus: item.payment_status,
      updatedAt: item.updated_at,
    };
  });

  return {
    metrics: {
      activeSellers: metrics?.active_sellers ?? 0,
      liveProducts: metrics?.live_products ?? 0,
      openOrders: metrics?.open_orders ?? 0,
      authorisedGmvCents: metrics?.authorised_gmv_cents ?? 0,
      capturedGmvCents: metrics?.captured_gmv_cents ?? 0,
      pendingPayoutCents: metrics?.pending_payout_cents ?? 0,
      currency: MARKET_CURRENCY,
    },
    sellerReviews,
    exceptions,
    recentEvents: eventResult.results.map((event) => ({
      id: event.id,
      orderId: event.order_id,
      orderNumber: event.order_number,
      sellerName: event.trading_name,
      actorRole: event.actor_role,
      eventType: event.event_type,
      ...(event.from_state ? { fromState: event.from_state } : {}),
      ...(event.to_state ? { toState: event.to_state } : {}),
      ...(event.reason ? { reason: event.reason } : {}),
      createdAt: event.created_at,
    })),
    demoMode: DEMO_MODE,
  };
}
