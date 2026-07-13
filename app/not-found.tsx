import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page page-shell">
      <Link href="/" className="wordmark">petalfolk<span>.</span></Link>
      <div>
        <p className="eyebrow">Page not found</p>
        <h1>This stem is not in the arrangement.</h1>
        <p>The page may have moved, or the link may belong to a later part of the beta.</p>
        <Link className="primary-button" href="/">Return to the marketplace</Link>
      </div>
    </main>
  );
}
