"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PreviewNav } from "./PreviewNav";
import { normalizeOrder } from "./SellerDashboardApp";
import { formatSgd, formatSingaporeDate, humanizeStatus, Message, Order, OrderEvent } from "./mvp-types";

function getProgress(order: Order) {
  if (order.commercialStatus === "declined") {
    return [
      { label: "Request placed", detail: "Capacity reserved and payment authorised", done: true, active: false },
      { label: "Request declined", detail: "Capacity released and payment authorisation voided", done: true, active: true },
    ];
  }
  const confirmed = ["confirmed", "completed"].includes(order.commercialStatus);
  const preparing = ["preparing", "ready", "ready_for_pickup", "ready_for_courier", "out_for_delivery", "in_transit", "delivered", "fulfilled"].includes(order.productionStatus ?? "") || order.commercialStatus === "completed";
  const ready = ["ready", "ready_for_pickup", "ready_for_courier", "out_for_delivery", "in_transit", "delivered", "fulfilled"].includes(order.productionStatus ?? "") || order.commercialStatus === "completed";
  const inTransit = ["out_for_delivery", "in_transit"].includes(order.productionStatus ?? "");
  const complete = order.commercialStatus === "completed" || ["delivered", "fulfilled", "collected"].includes(order.fulfilmentStatus ?? "");
  return [
    { label: "Request placed", detail: "Capacity reserved and payment authorised", done: true, active: !confirmed },
    { label: "Florist confirmed", detail: "Payment captured when the seller accepts", done: confirmed, active: confirmed && !preparing },
    { label: "Being arranged", detail: "Your florist is preparing the flowers", done: preparing, active: preparing && !ready },
    { label: order.fulfilmentMethod === "pickup" ? "Ready for pickup" : inTransit ? "Out for delivery" : "Ready for courier", detail: order.fulfilmentWindow, done: ready, active: ready && !complete },
    { label: order.fulfilmentMethod === "pickup" ? "Collected" : "Delivered", detail: "Order completed", done: complete, active: complete },
  ];
}

export function OrderTrackerApp({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const orderRequest = useRef(0);
  const hasLoadedOrder = useRef(false);
  const messageRequestKey = useRef("");

  async function loadOrder(silent = false) {
    const requestId = ++orderRequest.current;
    if (!silent) setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/orders/${orderId}`, { cache: "no-store" });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const apiError = data.error;
        const message =
          typeof apiError === "string"
            ? apiError
            : apiError && typeof apiError === "object"
              ? String((apiError as Record<string, unknown>).message ?? "This order could not be found.")
              : "This order could not be found.";
        throw new Error(message);
      }
      const raw = (data.order ?? data) as Record<string, unknown>;
      const normalized = normalizeOrder({ ...raw, events: data.events, messages: data.messages });
      if (requestId !== orderRequest.current) return;
      hasLoadedOrder.current = true;
      setOrder(normalized);
      setEvents(normalized.events ?? []);
      setMessages(normalized.messages ?? []);
      setError("");
      setRefreshNotice("");
    } catch (caught) {
      if (requestId !== orderRequest.current) return;
      const message = caught instanceof Error ? caught.message : "This order could not be found.";
      if (silent && hasLoadedOrder.current) {
        setRefreshNotice(`${message} Showing the last confirmed order update.`);
      } else {
        setError(message);
      }
    } finally {
      // A silent poll can supersede a slow initial request. Whichever current
      // request settles must release the initial loading screen.
      if (requestId === orderRequest.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    orderRequest.current += 1;
    hasLoadedOrder.current = false;
    const initialLoad = window.setTimeout(() => void loadOrder(), 0);
    const timer = window.setInterval(() => void loadOrder(true), 12000);
    return () => {
      orderRequest.current += 1;
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const progress = useMemo(() => order ? getProgress(order) : [], [order]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    if (!messageRequestKey.current) messageRequestKey.current = crypto.randomUUID();
    setSending(true);
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": messageRequestKey.current },
        body: JSON.stringify({ body, senderRole: "buyer", senderName: order?.buyerName ?? "Buyer" }),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const apiError = data.error;
        const message =
          typeof apiError === "string"
            ? apiError
            : apiError && typeof apiError === "object"
              ? String((apiError as Record<string, unknown>).message ?? "Message not sent.")
              : "Message not sent.";
        if (response.status < 500) messageRequestKey.current = "";
        throw new Error(message);
      }
      formElement.reset();
      messageRequestKey.current = "";
      setNotice("Message sent in this order thread.");
      await loadOrder(true);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="tracking-page">
      <PreviewNav active="order" />
      <header className="tracking-header page-shell">
        <Link href="/" className="wordmark">petalfolk<span>.</span></Link>
        <Link href="/" className="ghost-link">Continue shopping</Link>
      </header>

      {isLoading ? (
        <div className="tracking-loading page-shell"><div className="dashboard-skeleton" /><div className="dashboard-skeleton" /></div>
      ) : error || !order ? (
        <section className="tracking-error page-shell">
          <p className="eyebrow">Order access</p>
          <h1>We could not open this order.</h1>
          <p>{error || "The order reference is unavailable."}</p>
          <Link href="/" className="primary-button">Return to marketplace</Link>
        </section>
      ) : (
        <div className="tracking-shell page-shell">
          <section className="tracking-hero">
            <div>
              <p className="eyebrow">{order.orderNumber} · demo order access</p>
              <h1>{order.commercialStatus === "awaiting_seller" ? "Your florist is reviewing the request." : humanizeStatus(order.nextAction ?? order.commercialStatus)}</h1>
              <p>
                {order.commercialStatus === "awaiting_seller"
                  ? `${order.sellerName} has until ${formatSingaporeDate(order.acceptBy, true)} SGT to confirm. Your simulated payment is authorised, not captured.`
                  : `The latest order state is ${humanizeStatus(order.commercialStatus).toLowerCase()}. This page refreshes as the florist updates fulfilment.`}
              </p>
            </div>
            <div className="tracking-hero__status">
              <span className={`large-status-dot status-${order.commercialStatus}`} aria-hidden="true" />
              <div><span>Current state</span><strong>{humanizeStatus(order.commercialStatus)}</strong><small>{humanizeStatus(order.paymentStatus)} payment</small></div>
            </div>
          </section>
          {refreshNotice && <p className="dashboard-feedback" role="status">{refreshNotice}</p>}

          {order.commercialStatus === "awaiting_seller" && (
            <aside className="demo-handoff">
              <div><span className="detail-label">Continue the interactive demo</span><strong>Accept this request from the seller pathway.</strong><p>The payment and buyer timeline will update here after the seller acts.</p></div>
              <Link href="/seller" className="primary-button"><span>Open seller studio</span><span className="button-arrow" aria-hidden="true">→</span></Link>
            </aside>
          )}

          <div className="tracking-grid">
            <section className="tracking-main-card">
              <div className="tracking-card-heading"><div><p className="eyebrow">Fulfilment journey</p><h2>{formatSingaporeDate(order.fulfilmentDate)} · {order.fulfilmentWindow}</h2></div><span className="status-tag">{humanizeStatus(order.fulfilmentMethod)}</span></div>
              <div className="buyer-progress">
                {progress.map((step) => (
                  <div className={`buyer-progress__step ${step.done ? "is-done" : ""} ${step.active ? "is-active" : ""}`} key={step.label}>
                    <span className="buyer-progress__marker" aria-hidden="true" />
                    <div><strong>{step.label}</strong><span>{step.detail}</span></div>
                  </div>
                ))}
              </div>

              {order.fulfilmentMethod === "pickup" && (
                <div className="pickup-instructions">
                  <span className="detail-label">Private pickup instructions</span>
                  {order.privatePickupInstructions ? (
                    <><strong>{order.privatePickupInstructions}</strong><p>Released only because this order is confirmed and paid.</p></>
                  ) : (
                    <><strong>{order.publicPickupArea || "Collection location shown after confirmation"}</strong><p>Final collection instructions are confirmed in this order thread after seller acceptance.</p></>
                  )}
                </div>
              )}

              <div className="order-summary-block">
                <img src={order.productImageUrl || "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=600&q=80"} alt="" />
                <div><span>{order.sellerName}</span><strong>{order.productName}</strong><small>Quantity {order.quantity} · representative seasonal photo</small></div>
                <strong>{formatSgd(order.itemSubtotalCents)}</strong>
              </div>
              <dl className="buyer-totals">
                <div><dt>Arrangement</dt><dd>{formatSgd(order.itemSubtotalCents)}</dd></div>
                <div><dt>{order.fulfilmentMethod === "delivery" ? "Seller delivery" : "Self-pickup"}</dt><dd>{order.deliveryFeeCents ? formatSgd(order.deliveryFeeCents) : "Free"}</dd></div>
                <div><dt>Order total</dt><dd>{formatSgd(order.totalCents)}</dd></div>
              </dl>
            </section>

            <aside className="tracking-side">
              <section className="message-card">
                <div className="tracking-card-heading"><div><p className="eyebrow">Order thread</p><h2>Messages</h2></div><span>{messages.length}</span></div>
                <div className="message-list">
                  {messages.length ? messages.map((message) => (
                    <div className={`message message--${message.authorRole}`} key={message.id}>
                      <div><strong>{message.authorName}</strong><span>{humanizeStatus(message.authorRole)}</span></div>
                      <p>{message.body}</p>
                      <time>{formatSingaporeDate(message.createdAt, true)}</time>
                    </div>
                  )) : <p className="message-empty">Ask the florist a question about this order. Buyer, seller, support, and system messages remain visibly labelled.</p>}
                </div>
                <form className="message-form" onSubmit={sendMessage}>
                  <label><span>Message florist</span><textarea name="body" rows={3} placeholder="Write an order-specific question" maxLength={500} required /></label>
                  <button className="secondary-button" type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>
                </form>
                {notice && <p className="message-notice" role="status">{notice}</p>}
              </section>

              <section className="support-card">
                <span className="detail-label">Need help?</span>
                <h3>Production support will join this order thread.</h3>
                <p>Report lateness, damage, incorrect items, or a missing delivery without moving the conversation off-platform.</p>
                <button type="button" className="text-button" onClick={() => setNotice("Issue reporting is represented in this first build; evidence upload and refunds connect in the production phase.")}>Report an issue</button>
              </section>
            </aside>
          </div>

          <section className="buyer-timeline-section">
            <div><p className="eyebrow">Transparent record</p><h2>Order activity</h2></div>
            <div className="buyer-event-list">
              {(events.length ? events : [{ label: "Order requested", detail: "Capacity reservation created", createdAt: order.createdAt }]).map((event, index) => (
                <div className="buyer-event" key={event.id ?? `${event.createdAt}-${index}`}><span className="timeline-event__dot" /><div><strong>{event.label ?? humanizeStatus(event.type)}</strong><p>{event.detail ?? "System event recorded"}</p></div><time>{formatSingaporeDate(event.createdAt, true)}</time></div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
