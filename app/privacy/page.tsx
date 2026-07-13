import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notes",
  description: "Privacy architecture represented in the Petalfolk MVP.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page page-shell">
      <Link href="/" className="wordmark">petalfolk<span>.</span></Link>
      <div className="legal-page__content">
        <p className="eyebrow">Prototype privacy notes</p>
        <h1>Private by architecture, not by a hidden label.</h1>
        <p className="legal-lead">This is a demonstration of the intended product boundary, not a final privacy policy or legal notice.</p>
        <section><h2>What this build demonstrates</h2><p>Buyer and recipient details are kept separate. Home-based seller records expose a broad public area only. Exact private pickup instructions are intended to release only after order acceptance and payment capture.</p></section>
        <section><h2>What is simulated</h2><p>Authentication, consent records, encryption key management, role-based protected-data access, retention jobs, incident response, and notification delivery require production infrastructure before a closed beta.</p></section>
        <section><h2>Before collecting real data</h2><p>Confirm Singapore PDPA obligations, recipient-data consent or applicable delivery exceptions, retention periods, DPO processes, subprocessors, and the final privacy notice with qualified counsel.</p></section>
        <Link href="/" className="secondary-button">Return to marketplace</Link>
      </div>
    </main>
  );
}
