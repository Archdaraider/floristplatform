import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Beta terms",
  description: "Commercial boundaries represented in the Petalfolk MVP.",
};

export default function TermsPage() {
  return (
    <main className="legal-page page-shell">
      <Link href="/" className="wordmark">petalfolk<span>.</span></Link>
      <div className="legal-page__content">
        <p className="eyebrow">Prototype beta terms</p>
        <h1>No real orders or payments are accepted here.</h1>
        <p className="legal-lead">This page explains the demonstration. It is not a final consumer, seller, cancellation, refund, or marketplace agreement.</p>
        <section><h2>Seller responsibility</h2><p>The product model treats each florist as seller of record and responsible for the arrangement and seller-managed fulfilment, subject to legal confirmation.</p></section>
        <section><h2>Manual acceptance</h2><p>The demo authorises a simulated payment at checkout. Acceptance captures it; decline voids it. No buyer funds or payment credentials move through this repository.</p></section>
        <section><h2>Before a live pilot</h2><p>Confirm marketplace role, PSP configuration, GST and invoicing, cancellation and substitution rights, refund allocation, payout timing, and florist operating obligations with qualified professionals.</p></section>
        <Link href="/" className="secondary-button">Return to marketplace</Link>
      </div>
    </main>
  );
}
