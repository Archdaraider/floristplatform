"use client";

import Link from "next/link";

type PreviewNavProps = {
  active: "marketplace" | "seller" | "admin" | "order";
};

export function PreviewNav({ active }: PreviewNavProps) {
  return (
    <div className="preview-bar" role="region" aria-label="MVP pathway switcher">
      <div className="preview-bar__inner">
        <span className="preview-label">
          <span className="status-pulse" aria-hidden="true" />
          Interactive beta
        </span>
        <nav className="preview-paths" aria-label="Preview a pathway">
          <Link
            href="/"
            className={active === "marketplace" || active === "order" ? "is-active" : ""}
          >
            Consumer
          </Link>
          <Link href="/seller" className={active === "seller" ? "is-active" : ""}>
            Seller
          </Link>
          <Link href="/admin" className={active === "admin" ? "is-active" : ""}>
            Operations
          </Link>
        </nav>
      </div>
    </div>
  );
}
