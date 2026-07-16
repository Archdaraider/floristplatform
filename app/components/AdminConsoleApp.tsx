"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PreviewNav } from "./PreviewNav";
import { useAccessibleDialog } from "./useAccessibleDialog";
import { formatSgd, formatSingaporeDate, humanizeStatus } from "./mvp-types";

type AdminRecord = Record<string, unknown>;

export function AdminConsoleApp() {
  const [reviews, setReviews] = useState<AdminRecord[]>([]);
  const [exceptions, setExceptions] = useState<AdminRecord[]>([]);
  const [events, setEvents] = useState<AdminRecord[]>([]);
  const [metrics, setMetrics] = useState<AdminRecord>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedAdmin, setHasLoadedAdmin] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedReview, setSelectedReview] = useState<AdminRecord | null>(null);
  const hasLoadedAdminRef = useRef(false);
  const reviewDrawerRef = useRef<HTMLElement>(null);
  useAccessibleDialog({
    containerRef: reviewDrawerRef,
    onClose: () => setSelectedReview(null),
    enabled: Boolean(selectedReview),
  });

  async function loadAdmin() {
    if (!hasLoadedAdminRef.current) setIsLoading(true);
    try {
      const response = await fetch("/api/v1/admin/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error("Operations data unavailable");
      const data = (await response.json()) as {
        sellerReviews?: AdminRecord[];
        exceptions?: AdminRecord[];
        recentEvents?: AdminRecord[];
        metrics?: AdminRecord;
      };
      setReviews(data.sellerReviews ?? []);
      setExceptions(data.exceptions ?? []);
      setEvents(data.recentEvents ?? []);
      setMetrics(data.metrics ?? {});
      hasLoadedAdminRef.current = true;
      setHasLoadedAdmin(true);
      setLoadError("");
    } catch {
      setLoadError(
        hasLoadedAdminRef.current
          ? "Operations data could not refresh. Showing the last confirmed records."
          : "Operations data could not load. Queue status is unknown and no fallback records are being substituted.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadAdmin(), 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const openCases = Number(metrics.openCases ?? metrics.openExceptions ?? exceptions.length);
  const sellersLive = Number(metrics.sellersLive ?? metrics.activeSellers ?? 0);
  const awaitingReview = Number(metrics.awaitingReview ?? metrics.sellersUnderReview ?? reviews.filter((review) => review.approvalState !== "approved").length);
  const authorisedValue = Number(metrics.authorisedValueCents ?? metrics.authorisedGmvCents ?? metrics.gmvPendingCents ?? 0);

  return (
    <main className="admin-page">
      <PreviewNav active="admin" />
      <header className="admin-header">
        <div className="seller-header__brand"><Link href="/" className="wordmark">petalfolk<span>.</span></Link><span>Marketplace operations</span></div>
        <div className="admin-agent"><span>DO</span><div><strong>Demo operator · super admin</strong><small>Protected-access boundary represented</small></div></div>
      </header>

      <div className="admin-shell">
        <aside className="admin-rail">
          <span className="admin-rail__label">Workspace</span>
          <nav aria-label="Operations console sections">
            <a className="is-active" href="#overview">Overview</a>
            <a href="#reviews">Seller review <span>{hasLoadedAdmin ? reviews.length : "—"}</span></a>
            <a href="#exceptions">Exceptions <span>{hasLoadedAdmin ? exceptions.length : "—"}</span></a>
            <a href="#timeline">Audit timeline</a>
          </nav>
          <div className="admin-rail__privacy"><span className="status-pulse" /><strong>Privacy guard represented</strong><p>Production access to exact private addresses will require a role, reason, and immutable audit event.</p></div>
        </aside>

        <div className="admin-main">
          <section id="overview" className="admin-intro">
            <div><p className="eyebrow">Closed beta · Singapore</p><h1>Operate the promise, not just the catalogue.</h1><p>Seller approval, fulfilment exceptions, money movement, and protected-data access meet in one accountable queue.</p></div>
            <button className="secondary-button" type="button" onClick={() => void loadAdmin()}>Refresh records</button>
          </section>
          {loadError && <p className="dashboard-feedback dashboard-feedback--error" role="status">{loadError}</p>}

          <section className="admin-metrics" aria-label="Marketplace metrics">
            <div><span>Florists live</span><strong>{hasLoadedAdmin ? sellersLive : "—"}</strong><small>of 10–15 beta target</small></div>
            <div><span>Awaiting review</span><strong>{hasLoadedAdmin ? awaitingReview : "—"}</strong><small>identity and fulfilment checks</small></div>
            <div><span>Open exceptions</span><strong>{hasLoadedAdmin ? openCases : "—"}</strong><small>each with an owner</small></div>
            <div><span>Authorised value</span><strong>{hasLoadedAdmin ? formatSgd(authorisedValue) : "—"}</strong><small>not yet captured</small></div>
          </section>

          <div className="admin-grid">
            <section id="reviews" className="admin-panel admin-panel--reviews">
              <div className="admin-panel__heading"><div><p className="eyebrow">Supply quality</p><h2>Seller review</h2></div><span>{hasLoadedAdmin ? `${awaitingReview} pending` : "Status unknown"}</span></div>
              {isLoading ? <div className="dashboard-skeleton" /> : !hasLoadedAdmin ? (
                <div className="admin-empty"><strong>Review status unavailable</strong><p>Refresh before treating this queue as clear.</p></div>
              ) : reviews.length ? reviews.map((review) => (
                <button className="seller-review-row" type="button" key={String(review.id)} onClick={() => setSelectedReview(review)}>
                  <span className="review-monogram">{String(review.sellerName ?? "FS").split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                  <div><strong>{String(review.sellerName ?? review.tradingName ?? review.name ?? "Florist application")}</strong><span>{String(review.sellerType ?? "Independent florist")} · {String(review.area ?? review.publicArea ?? "Singapore")}</span></div>
                  <div><span className="status-tag">{humanizeStatus(String(review.approvalState ?? review.status ?? "under_review"))}</span><small>Submitted {formatSingaporeDate(String(review.submittedAt ?? "2026-07-13T08:00:00.000Z"))}</small></div>
                </button>
              )) : <div className="admin-empty"><strong>Review queue clear</strong><p>New invite-only seller submissions will appear here.</p></div>}
            </section>

            <section id="exceptions" className="admin-panel admin-panel--exceptions">
              <div className="admin-panel__heading"><div><p className="eyebrow">Needs intervention</p><h2>Exception queue</h2></div><span>{hasLoadedAdmin ? `${exceptions.length} open` : "Status unknown"}</span></div>
              <div className="exception-list">
                {isLoading ? <div className="dashboard-skeleton" /> : !hasLoadedAdmin ? (
                  <div className="admin-empty"><strong>Exception status unavailable</strong><p>Refresh before treating operational risk as clear.</p></div>
                ) : exceptions.length ? exceptions.map((exception) => (
                  <article className="exception-row" key={String(exception.id)}>
                    <span className={`exception-severity severity-${String(exception.severity ?? "watch")}`} aria-hidden="true" />
                    <div><strong>{humanizeStatus(String(exception.type ?? "support_case"))}</strong><span>{String(exception.orderNumber ?? "Marketplace review")} · {String(exception.sellerName ?? "Unassigned seller")}</span></div>
                    <div><small>{String(exception.owner ?? "Support queue")}</small><strong>{formatSingaporeDate(String(exception.dueAt ?? exception.deadline ?? "2026-07-13T08:00:00.000Z"), true)}</strong></div>
                  </article>
                )) : <div className="admin-empty"><strong>No active exceptions</strong><p>Acceptance, payment, substitution, fulfilment, and dispute risks are clear.</p></div>}
              </div>
            </section>

            <section id="timeline" className="admin-panel admin-panel--timeline">
              <div className="admin-panel__heading"><div><p className="eyebrow">Append-only record</p><h2>Recent activity</h2></div><span>Singapore time</span></div>
              <div className="admin-event-list">
                {isLoading ? <div className="dashboard-skeleton" /> : !hasLoadedAdmin ? (
                  <div className="admin-empty"><strong>Activity status unavailable</strong><p>Refresh before interpreting the audit timeline.</p></div>
                ) : events.length ? events.map((event) => (
                  <div className="admin-event" key={String(event.id)}><span className="timeline-event__dot" /><div><strong>{String(event.label ?? humanizeStatus(String(event.eventType ?? event.type ?? "event")))}</strong><p>{String(event.detail ?? event.reason ?? `${String(event.orderNumber ?? "Marketplace")} · ${String(event.sellerName ?? "system record")}`)}</p></div><span>{humanizeStatus(String(event.actorRole ?? event.actor ?? "system"))}</span><time>{formatSingaporeDate(String(event.createdAt ?? "2026-07-13T08:00:00.000Z"), true)}</time></div>
                )) : <div className="admin-empty"><strong>No activity recorded</strong><p>New immutable marketplace events will appear here.</p></div>}
              </div>
            </section>
          </div>

          <section className="admin-finance-note">
            <div><span className="detail-label">Financial boundary</span><h2>Buyer funds never enter the platform’s ordinary account.</h2></div>
            <p>This prototype models authorise, capture, void, commission, and payout states. A licensed marketplace PSP, legal terms, GST treatment, and refund authority must be confirmed before real transactions.</p>
          </section>
        </div>
      </div>

      {selectedReview && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSelectedReview(null)}>
          <aside ref={reviewDrawerRef} tabIndex={-1} className="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <div className="drawer-header"><div><p className="eyebrow">Invite-only application</p><h2 id="review-title">{String(selectedReview.sellerName ?? selectedReview.tradingName ?? "Seller review")}</h2></div><button className="dialog-close" type="button" onClick={() => setSelectedReview(null)} aria-label="Close seller review">×</button></div>
            <div className="review-checks">
              <div><span>Legal / UEN</span><strong>{String(selectedReview.uenStatus ?? "Pending check")}</strong></div>
              <div><span>Marketplace PSP</span><strong>{selectedReview.pspReady ? "Ready" : String(selectedReview.pspStatus ?? "Pending setup")}</strong></div>
              <div><span>Seller type</span><strong>{String(selectedReview.sellerType ?? "Independent florist")}</strong></div>
              <div><span>Public search area</span><strong>{String(selectedReview.area ?? selectedReview.publicArea ?? "Singapore")}</strong></div>
            </div>
            <div className="protected-note"><strong>Private location handling</strong><p>The review payload shows a public search area only. Opening an exact production or pickup address would require a purpose and create an audit event.</p></div>
            <p className="read-only-note"><strong>Read-only demo</strong><span>Approval and information-request actions are not connected yet.</span></p>
          </aside>
        </div>
      )}
    </main>
  );
}
