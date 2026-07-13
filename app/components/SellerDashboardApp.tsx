"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { normalizeProduct } from "./ConsumerMarketplace";
import { PreviewNav } from "./PreviewNav";
import { useAccessibleDialog } from "./useAccessibleDialog";
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
    verified: false,
    acceptingOrders: false,
  },
  orders: [],
  products: [],
  capacity: [],
};

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
    deliveryInstructions: String(raw.deliveryInstructions ?? ""),
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
    verified:
      raw.verified !== undefined
        ? Boolean(raw.verified)
        : String(raw.verificationStatus ?? "") === "verified",
    acceptingOrders: Boolean(raw.acceptingOrders ?? raw.acceptingNewOrders ?? false),
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
  const [detailError, setDetailError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedDashboard, setHasLoadedDashboard] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [feedback, setFeedback] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const dashboardRequest = useRef(0);
  const hasLoadedDashboardRef = useRef(false);
  const transitionKeys = useRef(new Map<string, string>());
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const declineDialogRef = useRef<HTMLElement>(null);
  const declineTextareaRef = useRef<HTMLTextAreaElement>(null);
  useAccessibleDialog({
    containerRef: declineDialogRef,
    initialFocusRef: declineTextareaRef,
    onClose: () => {
      if (!busyAction) setDeclineOpen(false);
    },
    enabled: declineOpen,
  });

  async function loadDashboard() {
    const requestId = ++dashboardRequest.current;
    if (!hasLoadedDashboardRef.current) setIsLoading(true);
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
      if (requestId !== dashboardRequest.current) return;
      hasLoadedDashboardRef.current = true;
      setHasLoadedDashboard(true);
      setRefreshError("");
      setDashboard(next);
      setSelectedId((current) =>
        current && orders.some((order) => order.id === current) ? current : orders[0]?.id || "",
      );
    } catch {
      if (requestId === dashboardRequest.current) {
        setRefreshError(
          hasLoadedDashboardRef.current
            ? "The operations service could not refresh. Showing the last confirmed dashboard state."
            : "The operations service could not load. Order intake and queue status remain unknown.",
        );
      }
    } finally {
      if (requestId === dashboardRequest.current) setIsLoading(false);
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
    if (!selectedId) return;
    let cancelled = false;
    void fetch(`/api/v1/orders/${selectedId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Order detail unavailable");
        return response.json() as Promise<Record<string, unknown>>;
      })
      .then((data) => {
        if (cancelled) return;
        const orderRaw = (data.order ?? data) as Record<string, unknown>;
        setDetailError("");
        setSelectedDetail(normalizeOrder({
          ...orderRaw,
          events: data.events ?? orderRaw.events,
          messages: data.messages ?? orderRaw.messages,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setDetailError("Full order details could not be loaded. Actions stay disabled until a refresh succeeds.");
          setDeclineOpen(false);
        }
      });
    return () => { cancelled = true; };
  }, [dashboard.orders, selectedId]);

  const selectedOrder =
    (selectedDetail?.id === selectedId ? selectedDetail : null) ??
    dashboard.orders.find((order) => order.id === selectedId) ??
    null;
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
    if (!selectedOrder || selectedDetail?.id !== selectedId || detailError) {
      setFeedback("Wait for the full order details to load before applying a fulfilment action.");
      return;
    }
    const commandKey = `${selectedOrder.id}:${action}:${reason ?? ""}`;
    const requestKey = transitionKeys.current.get(commandKey) ?? crypto.randomUUID();
    transitionKeys.current.set(commandKey, requestKey);
    setBusyAction(action);
    setFeedback("");
    try {
      const response = await fetch(`/api/v1/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "Idempotency-Key": requestKey },
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
        if (response.status < 500) transitionKeys.current.delete(commandKey);
        throw new Error(message);
      }
      transitionKeys.current.delete(commandKey);
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
    if (!hasLoadedDashboard || refreshError) return;
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
    if (!hasLoadedDashboard || refreshError) return;
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

  function selectOrder(orderId: string) {
    setSelectedDetail(null);
    setDetailError("");
    setSelectedId(orderId);
    setDeclineOpen(false);
    if (window.matchMedia("(max-width: 768px)").matches) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.requestAnimationFrame(() =>
        detailPanelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }),
      );
    }
  }

  async function sendSellerMessage(orderId: string, body: string, requestKey: string) {
    setBusyAction("message");
    setFeedback("");
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          body,
          senderRole: "seller",
          senderName: dashboard.seller.name,
        }),
      });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const apiError = data.error;
        const message =
          typeof apiError === "string"
            ? apiError
            : apiError && typeof apiError === "object"
              ? String((apiError as Record<string, unknown>).message ?? "Message not sent.")
              : "Message not sent.";
        setFeedback(message);
        return response.status >= 500 ? "retryable" as const : "rejected" as const;
      }
      const raw = (data.message ?? {}) as Record<string, unknown>;
      const message: Message = {
        id: String(raw.id ?? crypto.randomUUID()),
        authorName: String(raw.senderName ?? dashboard.seller.name),
        authorRole: (raw.senderRole ?? "seller") as Message["authorRole"],
        body: String(raw.body ?? body),
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
      };
      setSelectedDetail((current) =>
        current?.id === orderId
          ? { ...current, messages: [...(current.messages ?? []), message] }
          : current,
      );
      setFeedback("Message added to the buyer’s order thread.");
      return "sent" as const;
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Message not sent.");
      return "retryable" as const;
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
            className={`intake-toggle ${hasLoadedDashboard && dashboard.seller.acceptingOrders ? "is-open" : ""}`}
            type="button"
            onClick={() => void toggleAcceptingOrders()}
            disabled={!hasLoadedDashboard || Boolean(refreshError) || busyAction === "seller-setting"}
            aria-pressed={hasLoadedDashboard ? Boolean(dashboard.seller.acceptingOrders) : undefined}
          >
            <span className="intake-toggle__dot" aria-hidden="true" />
            {!hasLoadedDashboard
              ? "Checking order intake…"
              : refreshError
                ? "Order intake unavailable"
                : dashboard.seller.acceptingOrders ? "Accepting orders" : "New orders paused"}
          </button>
        </div>
      </header>

      <div className="seller-layout">
        <aside className="seller-sidebar">
          <div className="seller-identity">
            <span className="seller-monogram">PP</span>
            <div>
              <strong>{dashboard.seller.name}</strong>
              <span>{hasLoadedDashboard ? `${dashboard.seller.area} · reviewed` : "Seller status unavailable"}</span>
            </div>
          </div>
          <nav className="seller-tabs" aria-label="Seller dashboard sections">
            <button className={activeTab === "orders" ? "is-active" : ""} onClick={() => setActiveTab("orders")} type="button">
              Orders <span>{hasLoadedDashboard ? activeOrders.length : "—"}</span>
            </button>
            <button className={activeTab === "catalogue" ? "is-active" : ""} onClick={() => setActiveTab("catalogue")} type="button">
              Catalogue <span>{hasLoadedDashboard ? dashboard.products.length : "—"}</span>
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
              <p>{!hasLoadedDashboard ? "Checking the live order queue and intake controls." : awaitingOrders.length ? `${awaitingOrders.length} request${awaitingOrders.length === 1 ? "" : "s"} need a decision before their confirmation deadline.` : "Your urgent queue is clear. The next fulfilment deadlines are below."}</p>
            </div>
            <div className="seller-welcome__date">
              <span>Singapore time</span>
              <strong>{new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</strong>
            </div>
          </section>

          <section className="metric-ribbon" aria-label="Seller overview">
            <div><span>Needs a response</span><strong>{hasLoadedDashboard ? awaitingOrders.length : "—"}</strong><small>sorted by confirm-by</small></div>
            <div><span>Active orders</span><strong>{hasLoadedDashboard ? activeOrders.length : "—"}</strong><small>across pickup and delivery</small></div>
            <div><span>Upcoming capacity</span><strong>{hasLoadedDashboard && totalCapacity ? `${usedCapacity}/${totalCapacity}` : "—"}</strong><small>{hasLoadedDashboard && totalCapacity ? "units committed" : hasLoadedDashboard ? "No slots configured" : "Checking availability"}</small></div>
            <div><span>Pending payout</span><strong>{hasLoadedDashboard ? formatSgd(pendingPayout) : "—"}</strong><small>after completion hold</small></div>
          </section>

          {refreshError && <p className="dashboard-feedback dashboard-feedback--error" role="status">{refreshError}</p>}
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
                ) : !hasLoadedDashboard ? (
                  <div className="seller-empty"><span className="seller-empty__mark" /><h3>Order queue unavailable</h3><p>Refresh to retry. No empty-queue claim is shown until the service confirms it.</p></div>
                ) : orderedQueues.length ? orderedQueues.map((order) => (
                  <button
                    className={`order-queue__item ${selectedId === order.id ? "is-selected" : ""} ${order.commercialStatus === "awaiting_seller" ? "is-urgent" : ""}`}
                    type="button"
                    onClick={() => selectOrder(order.id)}
                    aria-pressed={selectedId === order.id}
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

              <div className="order-detail-panel" ref={detailPanelRef}>
                {selectedOrder ? (
                  <OrderDetail
                    key={selectedOrder.id}
                    order={selectedOrder}
                    busyAction={busyAction}
                    actionsEnabled={selectedDetail?.id === selectedId && !detailError}
                    detailStatus={detailError || (selectedDetail?.id !== selectedId ? "Loading authorised fulfilment details before actions are enabled…" : "")}
                    onAction={(action) => void transitionOrder(action)}
                    onDecline={() => setDeclineOpen(true)}
                    onSendMessage={(body, requestKey) =>
                      sendSellerMessage(selectedOrder.id, body, requestKey)
                    }
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
                <button className="secondary-button" type="button" disabled={!hasLoadedDashboard || Boolean(refreshError)} onClick={() => setFeedback("Catalogue creation is the next seller workflow to connect; this first version supports safe pause and restore actions.")}>Add arrangement</button>
              </div>
              <p className="workspace-description">Pause an arrangement without changing any order already placed. Price and policy details are snapshotted when buyers submit.</p>
              <div className="seller-product-list">
                {!hasLoadedDashboard ? (
                  <div className="seller-empty seller-empty--compact"><h3>Catalogue unavailable</h3><p>Refresh the dashboard before changing storefront availability.</p></div>
                ) : dashboard.products.length ? dashboard.products.map((product) => (
                  <article className="seller-product-row" key={product.id}>
                    <img src={product.imageUrl} alt="" />
                    <div>
                      <div className="seller-product-row__title"><strong>{product.name}</strong><span className={`status-tag ${product.status === "paused" ? "status-tag--paused" : ""}`}>{product.status ?? "published"}</span></div>
                      <span>{product.style} · from {formatSgd(product.priceCents)}</span>
                      <small>{product.fulfilmentMethods.map(humanizeStatus).join(" + ")} · {product.leadTimeHours}h lead time</small>
                    </div>
                    <button type="button" onClick={() => void toggleProduct(product)} disabled={!hasLoadedDashboard || Boolean(refreshError) || busyAction === product.id}>
                      {product.status === "paused" ? "Restore" : "Pause"}
                    </button>
                  </article>
                )) : (
                  <div className="seller-empty seller-empty--compact"><h3>No arrangements configured</h3><p>Published and paused products will appear here.</p></div>
                )}
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
                    {hasLoadedDashboard && dashboard.capacity.map((slot) => (
                      <div className="capacity-day" key={slot.date}>
                        <div><strong>{formatSingaporeDate(slot.date)}</strong><span>{slot.total - slot.used} spaces open</span></div>
                        <div className="capacity-meter" aria-label={`${slot.used} of ${slot.total} capacity units used`}><span style={{ transform: `scaleX(${slot.total ? slot.used / slot.total : 0})` }} /></div>
                        <span>{slot.used}/{slot.total}</span>
                      </div>
                    ))}
                    {!hasLoadedDashboard ? (
                      <div className="seller-empty seller-empty--compact">
                        <h3>Capacity unavailable</h3>
                        <p>Refresh before treating any date as open or full.</p>
                      </div>
                    ) : !dashboard.capacity.length && (
                      <div className="seller-empty seller-empty--compact">
                        <h3>No upcoming capacity configured</h3>
                        <p>Add availability before reopening intake for new dates.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="settings-stack">
                  {!hasLoadedDashboard ? (
                    <div className="settings-card"><span className="detail-label">Fulfilment settings</span><strong>Status unavailable</strong><p>Refresh before relying on lead-time, delivery-zone, or pickup settings.</p></div>
                  ) : (
                    <>
                      <div className="settings-card"><span className="detail-label">Lead time</span><strong>24 hours</strong><p>Same-day cutoff remains disabled for beta.</p><button type="button" onClick={() => setFeedback("Lead-time editing is represented in this first build; the persisted rule editor is part of the next seller slice.")}>Edit rule</button></div>
                      <div className="settings-card"><span className="detail-label">Delivery</span><strong>Central Singapore · S$10</strong><p>Seller-managed delivery in the configured postal sectors.</p><button type="button" onClick={() => setFeedback("Zone editing is represented in this first build; checkout already enforces the seeded service zone.")}>Manage zone</button></div>
                      <div className="settings-card"><span className="detail-label">Home pickup</span><strong>Not enabled</strong><p>This home studio is delivery-only. Pickup requires seller opt-in and platform approval.</p><button type="button" onClick={() => setFeedback("Home-pickup review is a next-step workflow; exact home address data stays outside all public projections.")}>Review eligibility</button></div>
                    </>
                  )}
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
          <section ref={declineDialogRef} tabIndex={-1} className="checkout-dialog decline-dialog" role="dialog" aria-modal="true" aria-labelledby="decline-title">
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
                  ref={declineTextareaRef}
                  rows={4}
                  maxLength={500}
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="For example: a required flower is no longer available from today’s shipment."
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
  actionsEnabled,
  detailStatus,
  onAction,
  onDecline,
  onSendMessage,
}: {
  order: Order;
  busyAction: string;
  actionsEnabled: boolean;
  detailStatus: string;
  onAction: (action: string) => void;
  onDecline: () => void;
  onSendMessage: (
    body: string,
    requestKey: string,
  ) => Promise<"sent" | "retryable" | "rejected">;
}) {
  const [messageBody, setMessageBody] = useState("");
  const messageKey = useRef("");
  const primaryActions = (order.allowedActions ?? []).filter((action) => action !== "decline");
  const actions = primaryActions.length
    ? primaryActions
    : order.commercialStatus === "awaiting_seller" ? ["accept"] : [];

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageBody.trim();
    if (!actionsEnabled || !body || busyAction) return;
    if (!messageKey.current) messageKey.current = crypto.randomUUID();
    const result = await onSendMessage(body, messageKey.current);
    if (result === "sent") {
      setMessageBody("");
      messageKey.current = "";
    } else if (result === "rejected") {
      // A deterministic 4xx means this command was not accepted. A corrected
      // message must use a fresh idempotency key rather than conflict forever.
      messageKey.current = "";
    }
  }

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

      {detailStatus && <p className="dashboard-feedback dashboard-feedback--error" role="status">{detailStatus}</p>}

      <div className="order-detail__facts">
        <div><span>Fulfilment</span><strong>{humanizeStatus(order.fulfilmentMethod)}</strong><small>{formatSingaporeDate(order.fulfilmentDate)} · {order.fulfilmentWindow}</small></div>
        <div><span>Payment</span><strong>{humanizeStatus(order.paymentStatus)}</strong><small>{order.paymentStatus === "authorised" ? "Capture on acceptance" : "Demo PSP record"}</small></div>
        <div><span>Buyer</span><strong>{order.buyerName}</strong><small>{order.buyerEmail}</small></div>
        <div><span>Recipient</span><strong>{order.recipientName}</strong><small>{order.recipientPhone || "Contact in order record"}</small></div>
        {order.fulfilmentMethod === "delivery" && (
          <div className="order-detail__fact-wide"><span>Delivery destination</span><strong>{order.addressLine || "Address unavailable"}</strong><small>{order.postcode ? `Singapore ${order.postcode}` : "Postcode unavailable"}</small></div>
        )}
        {order.fulfilmentMethod === "pickup" && (
          <div className="order-detail__fact-wide"><span>Pickup handoff</span><strong>{order.privatePickupInstructions || order.publicPickupArea || "Confirm collection details in the thread"}</strong><small>Visible in this authorised order workspace</small></div>
        )}
      </div>

      {(order.cardMessage || order.substitutionPreference || order.deliveryInstructions) && (
        <div className="order-instructions">
          {order.cardMessage && <div><span>Gift message</span><p>“{order.cardMessage}”</p></div>}
          {order.substitutionPreference && <div><span>Substitution preference</span><p>{humanizeStatus(order.substitutionPreference)}</p></div>}
          {order.deliveryInstructions && <div><span>Delivery instructions</span><p>{order.deliveryInstructions}</p></div>}
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
            <button className="primary-button" type="button" key={action} onClick={() => onAction(action)} disabled={!actionsEnabled || Boolean(busyAction)}>
              <span>{busyAction === action ? "Updating…" : actionLabels[action] ?? humanizeStatus(action)}</span><span className="button-arrow" aria-hidden="true">→</span>
            </button>
          ))}
          {(order.allowedActions?.includes("decline") || order.commercialStatus === "awaiting_seller") && (
            <button className="decline-button" type="button" onClick={onDecline} disabled={!actionsEnabled || Boolean(busyAction)}>Decline with reason</button>
          )}
        </div>
      )}

      <section className="seller-message-thread" aria-labelledby={`seller-thread-${order.id}`}>
        <div className="seller-message-thread__heading">
          <div><span className="detail-label">Order conversation</span><h3 id={`seller-thread-${order.id}`}>Buyer and florist messages</h3></div>
          <span>{order.messages?.length ?? 0}</span>
        </div>
        <div className="seller-message-thread__list">
          {order.messages?.length ? order.messages.map((message) => (
            <div className={`message message--${message.authorRole}`} key={message.id}>
              <div><strong>{message.authorName}</strong><span>{humanizeStatus(message.authorRole)}</span></div>
              <p>{message.body}</p>
              <time>{formatSingaporeDate(message.createdAt, true)}</time>
            </div>
          )) : <p className="message-empty">No messages yet. Keep delivery and substitution decisions in this order thread.</p>}
        </div>
        <form className="message-form" onSubmit={submitMessage}>
          <label><span>Reply to buyer</span><textarea rows={3} maxLength={500} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="Share an order-specific update" required /></label>
          <button className="secondary-button" type="submit" disabled={!actionsEnabled || !messageBody.trim() || Boolean(busyAction)}>{busyAction === "message" ? "Sending…" : "Send update"}</button>
        </form>
      </section>

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
