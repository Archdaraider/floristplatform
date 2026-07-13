"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { normalizeProduct } from "./ConsumerMarketplace";
import { PreviewNav } from "./PreviewNav";
import {
  formatSgd,
  formatSingaporeDate,
  humanizeStatus,
  Message,
  Order,
  Product,
  Seller,
} from "./mvp-types";

type SellerDashboardPayload = {
  demoMode?: boolean;
  seller?: Record<string, unknown>;
  orders?: Record<string, unknown>[];
  products?: Record<string, unknown>[];
  metrics?: Record<string, unknown>;
  capacity?: Array<Record<string, unknown>>;
};

type DashboardState = {
  seller: Seller;
  orders: Order[];
  products: Product[];
  capacity: Array<{ date: string; used: number; total: number }>;
};

const emptyDashboard: DashboardState = {
  seller: {
    id: "seller-petal-poem",
    name: "Petal & Poem",
    area: "Tiong Bahru",
    sellerType: "Home studio",
    verified: true,
    acceptingOrders: true,
  },
  orders: [],
  products: [],
  capacity: [],
};

const sampleCapacity = [
  { date: "2026-07-13T00:00:00.000Z", used: 2, total: 6 },
  { date: "2026-07-14T00:00:00.000Z", used: 4, total: 6 },
  { date: "2026-07-15T00:00:00.000Z", used: 1, total: 5 },
];

function textFrom(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.label ?? record.title ?? record.description ?? fallback);
  }
  return fallback;
}

export function normalizeOrder(raw: Record<string, unknown>): Order {
  const seller = (raw.seller ?? {}) as Record<string, unknown>;
  const product = (raw.productSnapshot ?? {}) as Record<string, unknown>;
  const totals = (raw.totals ?? {}) as Record<string, unknown>;
  const buyer = (raw.buyer ?? {}) as Record<string, unknown>;
  const recipient = (raw.recipient ?? {}) as Record<string, unknown>;
  const operationalStatus = textFrom(raw.operationalStatus, "not_started");
  const rawEvents = Array.isArray(raw.events) ? (raw.events as Record<string, unknown>[]) : [];
  const rawMessages = Array.isArray(raw.messages) ? (raw.messages as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id ?? ""),
    orderNumber: String(raw.orderNumber ?? raw.id ?? "Order"),
    sellerId: String(raw.sellerId ?? seller.id ?? "seller-petal-poem"),
    sellerName: String(raw.sellerName ?? seller.name ?? seller.tradingName ?? "Petal & Poem"),
    productId: String(raw.productId ?? product.id ?? product.productId ?? ""),
    productName: String(raw.productName ?? product.name ?? product.title ?? "Seasonal arrangement"),
    productImageUrl: String(raw.productImageUrl ?? product.imageUrl ?? ""),
    buyerName: String(raw.buyerName ?? buyer.name ?? "Buyer"),
    buyerEmail: String(raw.buyerEmail ?? buyer.email ?? ""),
    recipientName: String(raw.recipientName ?? recipient.name ?? "Recipient"),
    recipientPhone: String(raw.recipientPhone ?? recipient.phone ?? ""),
    fulfilmentMethod: (raw.fulfilmentMethod ?? raw.method ?? "delivery") as Order["fulfilmentMethod"],
    fulfilmentDate: String(raw.fulfilmentDate ?? raw.requestedDate ?? ""),
    fulfilmentWindow: String(raw.fulfilmentWindow ?? raw.window ?? "Window to confirm"),
    postcode: String(raw.postcode ?? raw.deliveryPostcode ?? recipient.postcode ?? ""),
    addressLine: String(raw.addressLine ?? recipient.addressLine ?? recipient.address ?? ""),
    publicPickupArea: String(
      raw.publicPickupArea ?? seller.publicAddress ?? seller.publicArea ?? "Collection location shown after confirmation",
    ),
    privatePickupInstructions: raw.privatePickupInstructions ? String(raw.privatePickupInstructions) : null,
    cardMessage: String(raw.cardMessage ?? raw.giftMessage ?? ""),
    substitutionPreference: String(raw.substitutionPreference ?? ""),
    quantity: Number(raw.quantity ?? product.quantity ?? 1),
    itemSubtotalCents: Number(raw.itemSubtotalCents ?? totals.itemSubtotalCents ?? totals.itemsCents ?? totals.subtotalCents ?? product.priceCents ?? product.unitPriceCents ?? 0),
    deliveryFeeCents: Number(raw.deliveryFeeCents ?? totals.deliveryFeeCents ?? totals.deliveryCents ?? 0),
    totalCents: Number(raw.totalCents ?? totals.totalCents ?? 0),
    commissionCents: Number(raw.commissionCents ?? totals.commissionCents ?? 0),
    payoutCents: Number(raw.payoutCents ?? totals.sellerPayoutCents ?? totals.payoutCents ?? totals.sellerNetCents ?? 0),
    commercialStatus: String(raw.commercialStatus ?? "awaiting_seller"),
    productionStatus: String(raw.productionStatus ?? operationalStatus),
    fulfilmentStatus: String(raw.fulfilmentStatus ?? operationalStatus),
    paymentStatus: String(raw.paymentStatus ?? "authorised"),
    payoutStatus: String(raw.payoutStatus ?? "not_started"),
    acceptBy: String(raw.acceptBy ?? raw.confirmBy ?? new Date().toISOString()),
    nextAction: textFrom(raw.nextAction, "Review the order request"),
    nextActionOwner: textFrom((raw.nextAction as Record<string, unknown> | undefined)?.owner, "Seller"),
    allowedActions: Array.isArray(raw.allowedActions) ? (raw.allowedActions as string[]) : [],
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    events: rawEvents.map((event) => ({
      id: String(event.id ?? ""),
      type: String(event.type ?? event.eventType ?? "order_event"),
      label: event.label ? String(event.label) : undefined,
      actor: event.actor ? String(event.actor) : undefined,
      actorRole: String(event.actorRole ?? "system"),
      detail: String(event.detail ?? event.reason ?? "Material order action recorded"),
      createdAt: String(event.createdAt ?? new Date().toISOString()),
    })),
    messages: rawMessages.map((message) => ({
      id: String(message.id ?? ""),
      authorName: String(message.authorName ?? message.senderName ?? "Florist Platform"),
      authorRole: (message.authorRole ?? message.senderRole ?? "system") as Message["authorRole"],
      body: String(message.body ?? ""),
      createdAt: String(message.createdAt ?? new Date().toISOString()),
    })),
  };
}

function normalizeSeller(raw?: Record<string, unknown>): Seller {
  if (!raw) return emptyDashboard.seller;
  return {
    id: String(raw.id ?? emptyDashboard.seller.id),
    name: String(raw.name ?? raw.tradingName ?? emptyDashboard.seller.name),
    area: String(raw.area ?? raw.publicArea ?? emptyDashboard.seller.area),
    sellerType: String(raw.sellerType ?? raw.type ?? emptyDashboard.seller.sellerType),
    verified: Boolean(raw.verified ?? true),
    acceptingOrders: Boolean(raw.acceptingOrders ?? raw.acceptingNewOrders ?? true),
    story: raw.story ? String(raw.story) : undefined,
  };
}

const actionLabels: Record<string, string> = {
  accept: "Accept & capture payment",
  decline: "Decline request",
  preparing: "Start preparation",
  ready: "Mark ready",
  out_for_delivery: "Hand to courier",
  delivered: "Mark delivered",
  fulfilled: "Complete order",
};

export function SellerDashboardApp() {
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard);
  const [activeTab, setActiveTab] = useState<"orders" | "catalogue" | "capacity">("orders");
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedDetail, setSelectedDetail] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [feedback, setFeedback] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  async function loadDashboard() {
    try {
      const response = await fetch("/api/v1/seller/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error("Dashboard unavailable");
      const data = (await response.json()) as SellerDashboardPayload;
      const orders = (data.orders ?? []).map(normalizeOrder);
      const next: DashboardState = {
        seller: normalizeSeller(data.seller),
        orders,
        products: (data.products ?? []).map(normalizeProduct),
        capacity: (data.capacity ?? []).map((slot) => ({
          date: String(slot.date ?? ""),
          used: Number(slot.used ?? Number(slot.committed ?? 0) + Number(slot.reserved ?? 0)),
          total: Number(slot.total ?? slot.capacity ?? 0),
        })),
      };
      setDashboard(next);
      setSelectedId((current) => current || orders[0]?.id || "");
    } catch {
      setFeedback("The operations service is reconnecting. New buyer orders will appear here when it is ready.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    const timer = window.setInterval(() => void loadDashboard(), 20000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    void fetch(`/api/v1/orders/${selectedId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Order detail unavailable");
        return response.json() as Promise<Record<string, unknown>>;
      })
      .then((data) => {
        if (cancelled) return;
        const orderRaw = (data.order ?? data) as Record<string, unknown>;
        setSelectedDetail(normalizeOrder({
          ...orderRaw,
          events: data.events ?? orderRaw.events,
          messages: data.messages ?? orderRaw.messages,
        }));
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(dashboard.orders.find((order) => order.id === selectedId) ?? null);
      });
    return () => { cancelled = true; };
  }, [dashboard.orders, selectedId]);

  const selectedOrder = selectedDetail ?? dashboard.orders.find((order) => order.id === selectedId) ?? null;
  const awaitingOrders = dashboard.orders.filter((order) => order.commercialStatus === "awaiting_seller");
  const activeOrders = dashboard.orders.filter((order) => !["declined", "cancelled", "completed"].includes(order.commercialStatus));
  const pendingPayout = dashboard.orders
    .filter((order) => ["payout_pending", "payout_available"].includes(order.payoutStatus ?? ""))
    .reduce((total, order) => total + (order.payoutCents ?? 0), 0);
  const usedCapacity = dashboard.capacity.reduce((total, slot) => total + slot.used, 0);
  const totalCapacity = dashboard.capacity.reduce((total, slot) => total + slot.total, 0);

  const orderedQueues = useMemo(() => {
    return [...dashboard.orders].sort((a, b) => {
      const aUrgent = a.commercialStatus === "awaiting_seller" ? 0 : 1;
      const bUrgent = b.commercialStatus === "awaiting_seller" ? 0 : 1;
      return aUrgent - bUrgent || new Date(a.acceptBy).getTime() - new Date(b.acceptBy).getTime();
    });
  }, [dashboard.orders]);

  async function transitionOrder(action: string, reason?: string) {
    if (!selectedOrder) return;
    setBusyAction(action);
    setFeedback("");
    try {
      const response = await fetch(`/api/v1/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ action, actor: "seller", ...(reason ? { reason } : {}) }),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const error = data.error;
        const message =
          typeof error === "string"
            ? error
            : error && typeof error === "object"
              ? String((error as Record<string, unknown>).message ?? "The order could not be updated.")
              : "The order could not be updated.";
        throw new Error(message);
      }
      const orderRaw = (data.order ?? data) as Record<string, unknown>;
      setSelectedDetail(normalizeOrder({ ...orderRaw, events: data.events, messages: data.messages }));
      setFeedback(`${actionLabels[action] ?? humanizeStatus(action)} recorded. The buyer view now reflects this state.`);
      if (action === "decline") {
        setDeclineOpen(false);
        setDeclineReason("");
      }
      await loadDashboard();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "The order could not be updated.");
    } finally {
      setBusyAction("");
    }
  }

  async function toggleAcceptingOrders() {
    setBusyAction("seller-setting");
    try {
      const response = await fetch("/api/v1/seller/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acceptingOrders: !dashboard.seller.acceptingOrders,
          acceptingNewOrders: !dashboard.seller.acceptingOrders,
        }),
      });
      if (!response.ok) throw new Error("The setting could not be changed.");
      await loadDashboard();
      setFeedback(dashboard.seller.acceptingOrders ? "New order intake is paused. Confirmed orders remain active." : "New order intake is open again.");
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "The setting could not be changed.");
    } finally {
      setBusyAction("");
    }
  }

  async function toggleProduct(product: Product) {
    setBusyAction(product.id);
    try {
      const nextStatus = product.status === "paused" ? "published" : "paused";
      const response = await fetch(`/api/v1/products/${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("The product status could not be changed.");
      setFeedback(`${product.name} is now ${nextStatus}. Historical order snapshots are unchanged.`);
      await loadDashboard();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "The product status could not be changed.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="seller-page">
      <PreviewNav active="seller" />
      <header className="seller-header">
        <div className="seller-header__brand">
          <Link href="/" className="wordmark">petalfolk<span>.</span></Link>
          <span>Seller studio</span>
        </div>
        <div className="seller-header__actions">
          <Link href="/" className="ghost-link">View storefront</Link>
          <button
            className={`intake-toggle ${dashboard.seller.acceptingOrders ? "is-open" : ""}`}
            type="button"
            onClick={() => void toggleAcceptingOrders()}
            disabled={busyAction === "seller-setting"}
            aria-pressed={Boolean(dashboard.seller.acceptingOrders)}
          >
            <span className="intake-toggle__dot" aria-hidden="true" />
            {dashboard.seller.acceptingOrders ? "Accepting orders" : "New orders paused"}
          </button>
        </div>
      </header>

      <div className="seller-layout">
        <aside className="seller-sidebar">
          <div className="seller-identity">
            <span className="seller-monogram">PP</span>
            <div>
              <strong>{dashboard.seller.name}</strong>
              <span>{dashboard.seller.area} · reviewed</span>
            </div>
          </div>
          <nav className="seller-tabs" aria-label="Seller dashboard sections">
            <button className={activeTab === "orders" ? "is-active" : ""} onClick={() => setActiveTab("orders")} type="button">
              Orders <span>{activeOrders.length}</span>
            </button>
            <button className={activeTab === "catalogue" ? "is-active" : ""} onClick={() => setActiveTab("catalogue")} type="button">
              Catalogue <span>{dashboard.products.length}</span>
            </button>
            <button className={activeTab === "capacity" ? "is-active" : ""} onClick={() => setActiveTab("capacity")} type="button">
              Availability
            </button>
          </nav>
          <div className="seller-sidebar__note">
            <span>Demo workspace</span>
            <p>Payment capture, notifications, and payouts are simulated in this build.</p>
          </div>
        </aside>

        <div className="seller-main">
          <section className="seller-welcome">
            <div>
              <p className="eyebrow">Today’s operations</p>
              <h1>Good afternoon, Petal & Poem.</h1>
              <p>{awaitingOrders.length ? `${awaitingOrders.length} request${awaitingOrders.length === 1 ? "" : "s"} need a decision before their confirmation deadline.` : "Your urgent queue is clear. The next fulfilment deadlines are below."}</p>
            </div>
            <div className="seller-welcome__date">
              <span>Singapore time</span>
              <strong>{new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</strong>
            </div>
          </section>

          <section className="metric-ribbon" aria-label="Seller overview">
            <div><span>Needs a response</span><strong>{awaitingOrders.length}</strong><small>sorted by confirm-by</small></div>
            <div><span>Active orders</span><strong>{activeOrders.length}</strong><small>across pickup and delivery</small></div>
            <div><span>Upcoming capacity</span><strong>{usedCapacity}/{totalCapacity || 18}</strong><small>units committed</small></div>
            <div><span>Pending payout</span><strong>{formatSgd(pendingPayout)}</strong><small>after completion hold</small></div>
          </section>

          {feedback && <p className="dashboard-feedback" role="status">{feedback}</p>}

          {activeTab === "orders" && (
            <section className="orders-workspace">
              <div className="order-queue">
                <div className="workspace-heading">
                  <div><p className="eyebrow">Action queue</p><h2>Orders by next deadline</h2></div>
                  <button className="refresh-button" type="button" onClick={() => void loadDashboard()}>Refresh</button>
                </div>
                {isLoading ? (
                  <div className="dashboard-skeleton" />
                ) : orderedQueues.length ? orderedQueues.map((order) => (
                  <button
                    className={`order-queue__item ${selectedId === order.id ? "is-selected" : ""} ${order.commercialStatus === "awaiting_seller" ? "is-urgent" : ""}`}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    key={order.id}
                  >
                    <span className={`order-status-dot status-${order.commercialStatus}`} aria-hidden="true" />
                    <span className="order-queue__main">
                      <strong>{order.productName}</strong>
                      <span>{order.orderNumber} · {order.recipientName}</span>
                    </span>
                    <span className="order-queue__deadline">
                      <strong>{order.commercialStatus === "awaiting_seller" ? "Respond by" : formatSingaporeDate(order.fulfilmentDate)}</strong>
                      <span>{order.commercialStatus === "awaiting_seller" ? formatSingaporeDate(order.acceptBy, true) : order.fulfilmentWindow}</span>
                    </span>
                  </button>
                )) : (
                  <div className="seller-empty"><span className="seller-empty__mark" /><h3>No orders yet</h3><p>Place a request from the consumer pathway and it will enter this queue.</p><Link href="/">Open consumer marketplace</Link></div>
                )}
              </div>

              <div className="order-detail-panel">
                {selectedOrder ? (
                  <OrderDetail
                    order={selectedOrder}
                    busyAction={busyAction}
                    onAction={(action) => void transitionOrder(action)}
                    onDecline={() => setDeclineOpen(true)}
                  />
                ) : (
                  <div className="order-detail-placeholder"><span>Select an order</span><p>Its next action, fulfilment context, payment state, and timeline will appear here.</p></div>
                )}
              </div>
            </section>
          )}

          {activeTab === "catalogue" && (
            <section className="catalogue-workspace">
              <div className="workspace-heading">
                <div><p className="eyebrow">Storefront controls</p><h2>Catalogue</h2></div>
                <button className="secondary-button" type="button" onClick={() => setFeedback("Catalogue creation is the next seller workflow to connect; this first version supports safe pause and restore actions.")}>Add arrangement</button>
              </div>
              <p className="workspace-description">Pause an arrangement without changing any order already placed. Price and policy details are snapshotted when buyers submit.</p>
              <div className="seller-product-list">
                {dashboard.products.map((product) => (
                  <article className="seller-product-row" key={product.id}>
                    <img src={product.imageUrl} alt="" />
                    <div>
                      <div className="seller-product-row__title"><strong>{product.name}</strong><span className={`status-tag ${product.status === "paused" ? "status-tag--paused" : ""}`}>{product.status ?? "published"}</span></div>
                      <span>{product.style} · from {formatSgd(product.priceCents)}</span>
                      <small>{product.fulfilmentMethods.map(humanizeStatus).join(" + ")} · {product.leadTimeHours}h lead time</small>
                    </div>
                    <button type="button" onClick={() => void toggleProduct(product)} disabled={busyAction === product.id}>
                      {product.status === "paused" ? "Restore" : "Pause"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "capacity" && (
            <section className="capacity-workspace">
              <div className="workspace-heading">
                <div><p className="eyebrow">Intake controls</p><h2>Capacity and fulfilment</h2></div>
                <span className="save-state">Changes affect new intake only</span>
              </div>
              <div className="capacity-layout">
                <div className="capacity-card">
                  <span className="detail-label">Next seven days</span>
                  <div className="capacity-days">
                    {(dashboard.capacity.length ? dashboard.capacity : sampleCapacity).map((slot) => (
                      <div className="capacity-day" key={slot.date}>
                        <div><strong>{formatSingaporeDate(slot.date)}</strong><span>{slot.total - slot.used} spaces open</span></div>
                        <div className="capacity-meter" aria-label={`${slot.used} of ${slot.total} capacity units used`}><span style={{ transform: `scaleX(${slot.total ? slot.used / slot.total : 0})` }} /></div>
                        <span>{slot.used}/{slot.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="settings-stack">
                  <div className="settings-card"><span className="detail-label">Lead time</span><strong>24 hours</strong><p>Same-day cutoff remains disabled for beta.</p><button type="button" onClick={() => setFeedback("Lead-time editing is represented in this first build; the persisted rule editor is part of the next seller slice.")}>Edit rule</button></div>
                  <div className="settings-card"><span className="detail-label">Delivery</span><strong>Central Singapore · S$10</strong><p>Seller-managed delivery in the configured postal sectors.</p><button type="button" onClick={() => setFeedback("Zone editing is represented in this first build; checkout already enforces the seeded service zone.")}>Manage zone</button></div>
                  <div className="settings-card"><span className="detail-label">Home pickup</span><strong>Not enabled</strong><p>This home studio is delivery-only. Pickup requires seller opt-in and platform approval.</p><button type="button" onClick={() => setFeedback("Home-pickup review is a next-step workflow; exact home address data stays outside all public projections.")}>Review eligibility</button></div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {declineOpen && selectedOrder && (
        <div
          className="dialog-backdrop checkout-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busyAction) setDeclineOpen(false);
          }}
        >
          <section className="checkout-dialog decline-dialog" role="dialog" aria-modal="true" aria-labelledby="decline-title">
            <button className="dialog-close" type="button" onClick={() => setDeclineOpen(false)} aria-label="Close decline form">×</button>
            <div className="checkout-dialog__intro">
              <p className="eyebrow">Decline {selectedOrder.orderNumber}</p>
              <h2 id="decline-title">Tell the buyer what changed.</h2>
              <p>Declining releases the reserved capacity and voids the simulated payment authorisation.</p>
            </div>
            <div className="checkout-form">
              <label>
                <span>Reason for declining</span>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="For example: a required flower is no longer available from today’s shipment."
                  autoFocus
                />
              </label>
              <div className="decline-dialog__actions">
                <button className="secondary-button" type="button" onClick={() => setDeclineOpen(false)} disabled={Boolean(busyAction)}>Keep order</button>
                <button
                  className="decline-button"
                  type="button"
                  disabled={!declineReason.trim() || Boolean(busyAction)}
                  onClick={() => void transitionOrder("decline", declineReason.trim())}
                >
                  {busyAction === "decline" ? "Declining…" : "Decline & release capacity"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function OrderDetail({
  order,
  busyAction,
  onAction,
  onDecline,
}: {
  order: Order;
  busyAction: string;
  onAction: (action: string) => void;
  onDecline: () => void;
}) {
  const primaryActions = (order.allowedActions ?? []).filter((action) => action !== "decline");
  const actions = primaryActions.length
    ? primaryActions
    : order.commercialStatus === "awaiting_seller" ? ["accept"] : [];
  return (
    <div className="order-detail">
      <div className="order-detail__heading">
        <div><p className="eyebrow">{order.orderNumber}</p><h2>{order.productName}</h2></div>
        <span className={`status-tag status-tag--${order.commercialStatus}`}>{humanizeStatus(order.commercialStatus)}</span>
      </div>

      <div className="next-action-card">
        <span>Next action · seller</span>
        <strong>{order.nextAction || "Continue fulfilment"}</strong>
        <small>{order.commercialStatus === "awaiting_seller" ? `Decision by ${formatSingaporeDate(order.acceptBy, true)} SGT` : `${formatSingaporeDate(order.fulfilmentDate)} · ${order.fulfilmentWindow}`}</small>
      </div>

      <div className="order-detail__facts">
        <div><span>Fulfilment</span><strong>{humanizeStatus(order.fulfilmentMethod)}</strong><small>{formatSingaporeDate(order.fulfilmentDate)} · {order.fulfilmentWindow}</small></div>
        <div><span>Payment</span><strong>{humanizeStatus(order.paymentStatus)}</strong><small>{order.paymentStatus === "authorised" ? "Capture on acceptance" : "Demo PSP record"}</small></div>
        <div><span>Buyer</span><strong>{order.buyerName}</strong><small>{order.buyerEmail}</small></div>
        <div><span>Recipient</span><strong>{order.recipientName}</strong><small>{order.recipientPhone || "Contact in order record"}</small></div>
      </div>

      {(order.cardMessage || order.substitutionPreference) && (
        <div className="order-instructions">
          {order.cardMessage && <div><span>Gift message</span><p>“{order.cardMessage}”</p></div>}
          {order.substitutionPreference && <div><span>Substitution preference</span><p>{humanizeStatus(order.substitutionPreference)}</p></div>}
        </div>
      )}

      <dl className="seller-financials">
        <div><dt>Order total</dt><dd>{formatSgd(order.totalCents)}</dd></div>
        <div><dt>Marketplace commission</dt><dd>−{formatSgd(order.commissionCents ?? 0)}</dd></div>
        <div><dt>Estimated payout</dt><dd>{formatSgd(order.payoutCents ?? order.totalCents - (order.commissionCents ?? 0))}</dd></div>
      </dl>

      {(actions.length > 0 || order.allowedActions?.includes("decline")) && (
        <div className="order-actions">
          {actions.map((action) => (
            <button className="primary-button" type="button" key={action} onClick={() => onAction(action)} disabled={Boolean(busyAction)}>
              <span>{busyAction === action ? "Updating…" : actionLabels[action] ?? humanizeStatus(action)}</span><span className="button-arrow" aria-hidden="true">→</span>
            </button>
          ))}
          {(order.allowedActions?.includes("decline") || order.commercialStatus === "awaiting_seller") && (
            <button className="decline-button" type="button" onClick={onDecline} disabled={Boolean(busyAction)}>Decline with reason</button>
          )}
        </div>
      )}

      <div className="order-timeline">
        <span className="detail-label">Order timeline</span>
        {(order.events?.length ? order.events : [{ label: "Order request received", detail: "Capacity held and payment authorised", createdAt: order.createdAt }]).map((event, index) => (
          <div className="timeline-event" key={event.id ?? `${event.createdAt}-${index}`}>
            <span className="timeline-event__dot" aria-hidden="true" />
            <div><strong>{event.label ?? humanizeStatus(event.type)}</strong><p>{event.detail ?? `${event.actorRole ?? event.actor ?? "System"} action recorded`}</p></div>
            <time>{formatSingaporeDate(event.createdAt, true)}</time>
          </div>
        ))}
      </div>
    </div>
  );
}
