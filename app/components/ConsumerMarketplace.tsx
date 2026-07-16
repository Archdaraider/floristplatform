"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PreviewNav } from "./PreviewNav";
import { useAccessibleDialog } from "./useAccessibleDialog";
import {
  formatSgd,
  FulfilmentMethod,
  Product,
  Seller,
} from "./mvp-types";

const DEFAULT_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=1200&q=86";

type MarketplacePlan = {
  date: string;
  method: FulfilmentMethod;
  postcode: string;
  budget: string;
  style: string;
  occasion: string;
};

type CartItem = {
  product: Product;
  plan: MarketplacePlan;
};

type SmartSearchMeta = {
  correctedQuery: string;
  exact: boolean;
  labels: string[];
  matchedLabels: string[];
  missingLabels: string[];
  appliedBudgetMaxCents?: number;
};

const CHECKOUT_FIELD_NAMES: Record<string, string> = {
  "buyer.name": "buyerName",
  "buyer.email": "buyerEmail",
  "recipient.name": "recipientName",
  "recipient.phone": "recipientPhone",
  "recipient.address": "addressLine",
  postcode: "postcode",
  window: "fulfilmentWindow",
  giftMessage: "cardMessage",
  deliveryInstructions: "deliveryInstructions",
};

function checkoutFieldErrors(fields?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([field, message]) => [CHECKOUT_FIELD_NAMES[field] ?? field, message]),
  );
}

function persistentRetryKey(storageKey: string) {
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function clearRetryKey(storageKey: string) {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing; in-memory retry safety remains.
  }
}

function singaporeDateFromNow(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDefaultDate() {
  return singaporeDateFromNow(3);
}

function getMinimumDate() {
  return singaporeDateFromNow(0);
}

function planSummary(plan: MarketplacePlan) {
  const method = plan.method === "delivery" ? "Delivery" : "Pickup";
  return `${method} · ${plan.date}${plan.method === "delivery" ? ` · Singapore ${plan.postcode}` : ""}`;
}

function smartSearchNote(count: number, search: SmartSearchMeta) {
  const resultLabel = `${count} ${count === 1 ? "match" : "matches"}`;
  if (search.exact) return `${resultLabel} · ${search.correctedQuery}.`;
  if (search.matchedLabels.length) {
    const missing = search.missingLabels.length
      ? ` Couldn’t confirm ${search.missingLabels.join(" + ")}.`
      : "";
    return `No exact match. Showing ${resultLabel} closest to ${search.matchedLabels.join(" + ")}.${missing}`;
  }
  return `Showing ${resultLabel} available. Try a flower, occasion, colour, or wrapping style.`;
}

export function normalizeProduct(raw: Record<string, unknown>): Product {
  const seller = (raw.seller ?? {}) as Record<string, unknown>;
  const availability = (raw.availability ?? {}) as Record<string, unknown>;
  const methods = (raw.fulfilmentMethods ?? raw.fulfillmentMethods ?? raw.methods ?? ["delivery"]) as FulfilmentMethod[];
  const windows = Array.isArray(raw.availableWindows)
    ? (raw.availableWindows as string[]).filter(Boolean)
    : availability.window
      ? [String(availability.window)]
      : [];
  return {
    id: String(raw.id ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    sellerId: String(raw.sellerId ?? seller.id ?? ""),
    sellerName: String(raw.sellerName ?? seller.name ?? seller.tradingName ?? "Independent florist"),
    sellerArea: String(raw.sellerArea ?? seller.area ?? seller.publicArea ?? availability.publicArea ?? "Singapore"),
    sellerType: String(raw.sellerType ?? seller.sellerType ?? "Independent florist"),
    verified:
      raw.verified !== undefined
        ? Boolean(raw.verified)
        : seller.verified !== undefined
          ? Boolean(seller.verified)
          : String(raw.verificationStatus ?? seller.verificationStatus ?? "") === "verified",
    name: String(raw.name ?? raw.title ?? "Seasonal arrangement"),
    description: String(raw.description ?? "A seasonal arrangement made by an independent Singapore florist."),
    priceCents: Number(raw.priceCents ?? 0),
    imageUrl: String(raw.imageUrl ?? DEFAULT_PRODUCT_IMAGE),
    imageAlt: raw.imageAlt ? String(raw.imageAlt) : undefined,
    style: String(raw.style ?? (Array.isArray(raw.styleTags) ? raw.styleTags[0] : "Seasonal")),
    occasions: Array.isArray(raw.occasions)
      ? (raw.occasions as string[])
      : Array.isArray(raw.occasionTags) ? (raw.occasionTags as string[]) : [],
    flowerTypes: Array.isArray(raw.flowerTypes)
      ? (raw.flowerTypes as string[])
      : Array.isArray(raw.flowerTags) ? (raw.flowerTags as string[]) : [],
    leadTimeHours: Number(raw.leadTimeHours ?? 24),
    fulfilmentMethods: methods,
    deliveryFeeCents: Number(raw.deliveryFeeCents ?? availability.deliveryFeeCents ?? 0),
    pickupLabel: raw.pickupLabel
      ? String(raw.pickupLabel)
      : methods.includes("pickup")
        ? String(
            seller.publicAddress ??
              `${String(availability.publicArea ?? seller.publicArea ?? "Singapore")} · collection details after confirmation`,
          )
        : null,
    capacityRemaining: Number(raw.capacityRemaining ?? availability.remainingCapacity ?? 1),
    availableWindows: windows.length ? windows : ["Window confirmed at checkout"],
    confirmationMinutes: Number(raw.confirmationMinutes ?? availability.confirmationMinutes ?? 60),
    rating: Number(raw.rating ?? 4.8),
    reviewCount: Number(raw.reviewCount ?? 0),
    stemCount: raw.stemCount ? String(raw.stemCount) : undefined,
    includedItems: Array.isArray(raw.includedItems)
      ? (raw.includedItems as string[])
      : undefined,
    dimensions: raw.dimensions ? String(raw.dimensions) : undefined,
    representativePhotoDisclosure: raw.representativePhotoDisclosure
      ? String(raw.representativePhotoDisclosure)
      : undefined,
    policies:
      raw.policies && typeof raw.policies === "object"
        ? (raw.policies as Product["policies"])
        : undefined,
    status: (raw.status as Product["status"]) ?? "published",
    representativePhoto: Boolean(
      raw.representativePhoto ?? raw.representativePhotoDisclosure,
    ),
  };
}

export function ConsumerMarketplace() {
  const [date, setDate] = useState(getDefaultDate);
  const [method, setMethod] = useState<FulfilmentMethod>("delivery");
  const [postcode, setPostcode] = useState("168732");
  const [budget, setBudget] = useState("140");
  const [style, setStyle] = useState("All styles");
  const [occasion, setOccasion] = useState("");
  const [flowerQuery, setFlowerQuery] = useState("");
  const [activeFlowerQuery, setActiveFlowerQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [searchNote, setSearchNote] = useState("Showing florist availability for your plan.");
  const [activePlan, setActivePlan] = useState<MarketplacePlan>(() => ({
    date: getDefaultDate(),
    method: "delivery",
    postcode: "168732",
    budget: "140",
    style: "All styles",
    occasion: "",
  }));
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailStatus, setProductDetailStatus] = useState<"idle" | "loading" | "ready" | "error" | "unavailable">("idle");
  const [cartItem, setCartItem] = useState<CartItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const catalogueRequest = useRef(0);
  const productDetailRequest = useRef(0);
  const initialPlan = useRef<MarketplacePlan>({
    date,
    method,
    postcode,
    budget,
    style,
    occasion,
  });

  const draftPlan: MarketplacePlan = { date, method, postcode, budget, style, occasion };
  const hasPendingPlanChanges =
    JSON.stringify(draftPlan) !== JSON.stringify(activePlan) ||
    flowerQuery.trim() !== activeFlowerQuery;

  async function searchCatalogue(
    plan: MarketplacePlan = draftPlan,
    query: string = flowerQuery,
  ) {
    const requestId = ++catalogueRequest.current;
    const searchParams = new URLSearchParams({
      date: plan.date,
      method: plan.method,
      postcode: plan.postcode,
      budget: plan.budget,
      style: plan.style === "All styles" ? "" : plan.style,
      occasion: plan.occasion,
    });
    if (query.trim()) searchParams.set("q", query.trim());
    setIsLoading(true);
    setSearchError("");
    setSearchNote(
      query.trim()
        ? "Understanding your request and checking florist availability…"
        : "Checking each florist’s date, capacity, and service area…",
    );
    try {
      const response = await fetch(`/api/v1/catalog?${searchParams.toString()}`);
      if (!response.ok) throw new Error("Catalogue unavailable");
      const data = (await response.json()) as {
        products?: Record<string, unknown>[];
        sellers?: Seller[];
        search?: SmartSearchMeta;
      };
      const nextProducts = (data.products ?? []).map(normalizeProduct);
      if (requestId !== catalogueRequest.current) return;
      const appliedBudget = data.search?.appliedBudgetMaxCents
        ? Math.min(Number(plan.budget) * 100, data.search.appliedBudgetMaxCents)
        : undefined;
      const appliedPlan = appliedBudget
        ? { ...plan, budget: String(Math.round(appliedBudget / 100)) }
        : plan;
      setProducts(nextProducts);
      setActivePlan(appliedPlan);
      setActiveFlowerQuery(query.trim());
      if (appliedBudget) setBudget(appliedPlan.budget);
      setSellers((data.sellers ?? []).map((seller) => {
        const raw = seller as unknown as Record<string, unknown>;
        return {
          id: String(raw.id ?? ""),
          name: String(raw.name ?? raw.tradingName ?? "Independent florist"),
          slug: raw.slug ? String(raw.slug) : undefined,
          area: String(raw.area ?? raw.publicArea ?? "Singapore"),
          sellerType: String(raw.sellerType ?? "Independent florist"),
          verified: String(raw.verificationStatus ?? "") === "verified",
          acceptingOrders: Boolean(raw.acceptingOrders ?? raw.acceptingNewOrders ?? false),
          story: raw.publicStory ? String(raw.publicStory) : undefined,
        };
      }));
      setSearchNote(
        data.search
          ? smartSearchNote(nextProducts.length, data.search)
          : nextProducts.length
            ? `${nextProducts.length} arrangements available · ${planSummary(appliedPlan)}.`
            : `No exact matches · ${planSummary(appliedPlan)}. Try another date, method, or budget.`,
      );
    } catch {
      if (requestId !== catalogueRequest.current) return;
      const message = "The availability service could not be reached. Check the demo server, then try again.";
      if (products.length) {
        setSearchNote(`${message} Your previous results are still shown.`);
      } else {
        setProducts([]);
        setSellers([]);
        setSearchError(message);
        setSearchNote(message);
      }
    } finally {
      if (requestId === catalogueRequest.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void searchCatalogue(initialPlan.current, ""), 0);
    return () => window.clearTimeout(initialLoad);
    // Initial availability check only; subsequent searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addToCart(product: Product) {
    if (cartItem && cartItem.product.sellerId !== product.sellerId) {
      setCartNotice(
        `Your basket already has an item from ${cartItem.product.sellerName}. Remove it before choosing from ${product.sellerName}.`,
      );
      setSelectedProduct(null);
      setCartOpen(true);
      return;
    }
    const replacedProduct =
      cartItem && cartItem.product.id !== product.id
        ? cartItem.product
        : null;
    setCartItem({ product, plan: activePlan });
    setCartNotice(
      replacedProduct
        ? `Replaced ${replacedProduct.name} with ${product.name}. This demo basket supports one arrangement per order.`
        : `Added for ${activePlan.method} on ${activePlan.date}. We’ll recheck availability at checkout.`,
    );
    setSelectedProduct(null);
    setCartOpen(true);
  }

  async function openProduct(product: Product) {
    const requestId = ++productDetailRequest.current;
    setSelectedProduct(product);
    setProductDetailStatus("loading");
    const params = new URLSearchParams({
      date: activePlan.date,
      method: activePlan.method,
      postcode: activePlan.postcode,
    });
    try {
      const response = await fetch(
        `/api/v1/products/${encodeURIComponent(product.slug)}?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok || !data.product || typeof data.product !== "object") {
        throw new Error("Product details unavailable");
      }
      if (requestId !== productDetailRequest.current) return;
      const rawDetail = data.product as Record<string, unknown>;
      const detailAvailability = (rawDetail.availability ?? {}) as Record<string, unknown>;
      setSelectedProduct({
        ...product,
        ...normalizeProduct(rawDetail),
      });
      setProductDetailStatus(detailAvailability.bookable === false ? "unavailable" : "ready");
    } catch {
      if (requestId === productDetailRequest.current) setProductDetailStatus("error");
    }
  }

  const availableStyles = [
    "All styles",
    "Romantic",
    "Garden",
    "Bright",
    "Sculptural",
    "Minimal",
    "Earthy",
    "Bold",
    "Modern",
  ];

  return (
    <main className="consumer-page">
      <PreviewNav active="marketplace" />

      <header className="market-nav page-shell">
        <Link href="/" className="wordmark" aria-label="Petalfolk home">
          petalfolk<span>.</span>
        </Link>
        <nav className="market-nav__links" aria-label="Marketplace navigation">
          <a href="#available">Shop flowers</a>
          <a href="#florists">Our florists</a>
          <button
            className="basket-button"
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={cartItem ? "Open basket with one item" : "Open empty basket"}
          >
            Basket <span>{cartItem ? "1" : "0"}</span>
          </button>
        </nav>
      </header>

      <section className="market-hero page-shell">
        <div className="market-hero__copy reveal-block">
          <p className="eyebrow">Independent florists · Singapore</p>
          <h1>
            Flowers that <em>arrive when you need them.</em>
          </h1>
          <p className="hero-intro">
            Choose a date and delivery or pickup. We’ll show only arrangements florists can fulfil.
          </p>

          <form
            className="availability-form"
            aria-busy={isLoading}
            onSubmit={(event) => {
              event.preventDefault();
              void searchCatalogue(draftPlan);
              document.querySelector("#available")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <label className="natural-search">
              <span>Describe the flowers</span>
              <input
                aria-describedby="natural-search-hint"
                maxLength={180}
                onChange={(event) => setFlowerQuery(event.target.value)}
                placeholder="e.g. roses + daisies, anniversary, black wrap"
                spellCheck
                type="search"
                value={flowerQuery}
              />
              <small id="natural-search-hint">Typos are okay.</small>
            </label>

            <fieldset className="method-control">
              <legend>How would you like to receive it?</legend>
              <div className="segmented-control">
                <button
                  type="button"
                  className={method === "delivery" ? "is-selected" : ""}
                  onClick={() => setMethod("delivery")}
                  aria-pressed={method === "delivery"}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  className={method === "pickup" ? "is-selected" : ""}
                  onClick={() => setMethod("pickup")}
                  aria-pressed={method === "pickup"}
                >
                  Self-pickup
                </button>
              </div>
            </fieldset>

            <div className={`availability-fields ${method === "pickup" ? "availability-fields--pickup" : ""}`}>
              <label>
                <span>Date</span>
                <input type="date" value={date} min={getMinimumDate()} onChange={(e) => setDate(e.target.value)} required />
              </label>
              {method === "delivery" && (
                <label>
                  <span>Delivery postcode</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 168732"
                    required
                  />
                </label>
              )}
              <button className="primary-button search-button" type="submit" disabled={isLoading}>
                <span>{isLoading ? "Finding matches…" : "Find flowers"}</span>
                <span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </form>
          {hasPendingPlanChanges && (
            <p className="plan-change-note" role="status">
              Your plan changed. Search again to refresh availability.
            </p>
          )}
        </div>

        <figure className="market-hero__visual reveal-block reveal-delay-1">
          <img
            src="https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1400&q=88"
            alt="A warm seasonal bouquet arranged with pink and apricot flowers"
          />
          <figcaption>
            <span>Made in small batches</span>
            <strong>by florists across Singapore</strong>
          </figcaption>
        </figure>
      </section>

      <section className="trust-strip" aria-label="Marketplace commitments">
        <div className="page-shell trust-strip__inner">
          <span>Availability rechecked</span>
          <span>Clear SGD totals</span>
          <span>Demo · no payment taken</span>
        </div>
      </section>

      <section id="available" className="catalogue-section page-shell">
        <div className="section-heading reveal-block">
          <div>
            <p className="eyebrow">Available for your plan</p>
            <h2>Flowers available for your date.</h2>
          </div>
          <p className="results-context" aria-live="polite">{searchNote}</p>
        </div>

        <div className="catalogue-controls" aria-label="Filter available arrangements">
          <label className="compact-select">
            <span>Occasion</span>
            <select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
              <option value="">Any occasion</option>
              <option value="birthday">Birthday</option>
              <option value="anniversary">Anniversary</option>
              <option value="romance">Romance</option>
              <option value="congratulations">Congratulations</option>
              <option value="thank-you">Thank you</option>
              <option value="get-well">Get well</option>
              <option value="sympathy">Sympathy</option>
              <option value="celebration">Celebration</option>
              <option value="housewarming">Housewarming</option>
              <option value="new-home">New home</option>
              <option value="corporate">Corporate</option>
            </select>
          </label>
          <label className="compact-select">
            <span>Style</span>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {availableStyles.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="budget-control">
            <span>Maximum {formatSgd(Number(budget) * 100)}</span>
            <input
              type="range"
              min="70"
              max="160"
              step="10"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              aria-label={`Maximum budget ${budget} Singapore dollars`}
            />
          </label>
          <button className="secondary-button filter-button" type="button" onClick={() => void searchCatalogue(draftPlan)} disabled={isLoading}>
            {isLoading ? "Updating…" : "Update results"}
          </button>
        </div>

        {isLoading ? (
          <div className="product-grid" aria-label="Loading florist availability">
            {[0, 1, 2, 3].map((item) => <div className="product-skeleton" key={item} />)}
          </div>
        ) : searchError ? (
          <div className="empty-results empty-results--error">
            <div className="empty-results__shape" aria-hidden="true" />
            <div>
              <p className="eyebrow">Availability unavailable</p>
              <h3>We could not refresh this florist plan.</h3>
              <p>{searchError}</p>
              <button className="secondary-button" type="button" onClick={() => void searchCatalogue(draftPlan)}>
                Try availability again
              </button>
            </div>
          </div>
        ) : products.length ? (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card reveal-block" style={{ "--item-index": index } as React.CSSProperties} key={product.id}>
                <div className="product-card__image">
                  <img src={product.imageUrl} alt={product.imageAlt ?? `${product.name} floral arrangement`} />
                  <span className="availability-badge">
                    <span className="availability-badge__full">
                      {product.capacityRemaining === 1 ? "Last florist slot" : `${product.capacityRemaining} florist slots`}
                    </span>
                    <span className="availability-badge__compact">
                      {product.capacityRemaining === 1 ? "Last slot" : `${product.capacityRemaining} slots`}
                    </span>
                  </span>
                </div>
                <div className="product-card__body">
                  <div className="product-card__seller">
                    <span className="product-card__seller-name">{product.sellerName}</span>
                    {product.verified && <span className="verified-mark" title="Manually reviewed florist">Verified</span>}
                  </div>
                  <div className="product-card__title">
                    <h3>{product.name}</h3>
                    <strong>{formatSgd(product.priceCents)}</strong>
                  </div>
                  <div className="product-card__meta">
                    <span className="product-card__meta-secondary">{product.style}</span>
                    <span className="product-card__meta-secondary">{product.sellerArea}</span>
                    <span className="product-card__meta-fulfilment">{activePlan.method === "delivery" ? `Delivery ${formatSgd(product.deliveryFeeCents)}` : "Pickup · free"}</span>
                  </div>
                  <button
                    aria-label={`View ${product.name} from ${product.sellerName}`}
                    className="secondary-button product-card__cta"
                    type="button"
                    onClick={() => void openProduct(product)}
                  >
                    <span className="product-card__cta-full">View arrangement</span>
                    <span className="product-card__cta-compact">View details</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-results">
            <div className="empty-results__shape" aria-hidden="true" />
            <div>
              <p className="eyebrow">No exact match</p>
              <h3>Try a little more room in the plan.</h3>
              <p>Switch to delivery, raise the budget, or choose another date. We do not show arrangements a florist cannot confidently fulfil.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const resetPlan = {
                    ...draftPlan,
                    style: "All styles",
                    budget: "160",
                    occasion: "",
                  };
                  setStyle(resetPlan.style);
                  setBudget(resetPlan.budget);
                  setOccasion(resetPlan.occasion);
                  setFlowerQuery("");
                  void searchCatalogue(resetPlan, "");
                }}
              >
                Reset optional filters
              </button>
            </div>
          </div>
        )}
      </section>

      <section id="florists" className="florist-section page-shell">
        <div className="florist-section__intro reveal-block">
          <p className="eyebrow">The florist matters</p>
          <h2>Small studios, chosen with care.</h2>
          <p>
            Every beta florist is reviewed. Private home addresses stay protected.
          </p>
        </div>
        <div className="florist-list">
          {sellers.map((seller, index) => (
            <div className="florist-row" key={seller.id}>
              <span className="florist-row__number">0{index + 1}</span>
              <div>
                <strong>{seller.name}</strong>
                <span>{seller.sellerType ?? "Independent florist"} · {seller.area}</span>
              </div>
              <span className="florist-row__status">Reviewed</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="market-footer">
        <div className="page-shell market-footer__inner">
          <div>
            <Link href="/" className="wordmark wordmark--light">petalfolk<span>.</span></Link>
            <p>A closed-beta marketplace for Singapore’s independent florists.</p>
          </div>
          <div>
            <span className="footer-label">MVP pathways</span>
            <Link href="/seller">Seller dashboard</Link>
            <Link href="/admin">Operations console</Link>
          </div>
          <div>
            <span className="footer-label">Beta note</span>
            <p>Payments are simulated. Do not enter real card details.</p>
            <div className="footer-legal"><Link href="/privacy">Privacy notes</Link><Link href="/terms">Beta terms</Link></div>
          </div>
        </div>
      </footer>

      {selectedProduct && (
        <ProductDialog
          product={selectedProduct}
          plan={activePlan}
          detailStatus={productDetailStatus}
          onClose={() => {
            productDetailRequest.current += 1;
            setSelectedProduct(null);
            setProductDetailStatus("idle");
          }}
          onAdd={() => addToCart(selectedProduct)}
          onRetry={() => void openProduct(selectedProduct)}
          onRefresh={() => {
            productDetailRequest.current += 1;
            setSelectedProduct(null);
            setProductDetailStatus("idle");
            void searchCatalogue(activePlan, activeFlowerQuery);
          }}
        />
      )}

      {cartOpen && (
        <CartDrawer
          item={cartItem}
          notice={cartNotice}
          onClose={() => setCartOpen(false)}
          onClear={() => { setCartItem(null); setCartNotice("Basket cleared."); }}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
        />
      )}

      {checkoutOpen && cartItem && (
        <CheckoutDialog
          item={cartItem}
          onClose={() => setCheckoutOpen(false)}
          onAvailabilityChanged={() => {
            const stalePlan = cartItem.plan;
            setDate(stalePlan.date);
            setMethod(stalePlan.method);
            setPostcode(stalePlan.postcode);
            setBudget(stalePlan.budget);
            setStyle(stalePlan.style);
            setOccasion(stalePlan.occasion);
            setCheckoutOpen(false);
            setCartItem(null);
            setCartNotice("Availability changed, so we cleared your basket and refreshed the results.");
            void searchCatalogue(stalePlan, activeFlowerQuery);
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.requestAnimationFrame(() =>
              document.querySelector("#available")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }),
            );
          }}
        />
      )}
    </main>
  );
}

function ProductDialog({
  product,
  plan,
  detailStatus,
  onClose,
  onAdd,
  onRetry,
  onRefresh,
}: {
  product: Product;
  plan: MarketplacePlan;
  detailStatus: "idle" | "loading" | "ready" | "error" | "unavailable";
  onClose: () => void;
  onAdd: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const { method, date } = plan;
  const dialogRef = useRef<HTMLElement>(null);
  useAccessibleDialog({ containerRef: dialogRef, onClose });
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close product details">×</button>
        <div className="product-dialog__image">
          <img src={product.imageUrl} alt={product.imageAlt ?? `${product.name} arrangement`} />
          {product.representativePhoto && <span>Representative seasonal photo</span>}
        </div>
        <div className="product-dialog__content">
          <p className="eyebrow">{product.sellerName} · {product.sellerArea}</p>
          <h2 id="product-dialog-title">{product.name}</h2>
          <div className="product-dialog__price">
            <strong>{formatSgd(product.priceCents)}</strong>
            {(product.dimensions || product.stemCount) && <span>{product.dimensions || product.stemCount}</span>}
          </div>
          <p className="product-dialog__description">{product.description}</p>

          <div className="fulfilment-summary">
            <span className="fulfilment-summary__label">Fulfilment</span>
            <div>
              <strong>{method === "delivery" ? "Seller-arranged delivery" : "Self-pickup"}</strong>
              <span>{date} · {product.availableWindows[0]}</span>
              <span>{method === "delivery" ? `${formatSgd(product.deliveryFeeCents)} delivery fee` : product.pickupLabel}</span>
            </div>
          </div>

          <div className="product-disclosures">
            <details>
              <summary>Arrangement details</summary>
              <ul>
                {product.dimensions && <li>Approximate size: {product.dimensions}</li>}
                <li>{product.leadTimeHours}-hour minimum lead time</li>
                {product.representativePhotoDisclosure && <li>{product.representativePhotoDisclosure}</li>}
                {product.includedItems?.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
            {product.policies && <details>
              <summary>Ordering policies</summary>
              <ul>
                {product.policies.substitution && <li>{product.policies.substitution}</li>}
                {product.policies.cancellation && <li>{product.policies.cancellation}</li>}
                {product.policies.freshness && <li>{product.policies.freshness}</li>}
                {method === "delivery" && product.policies.sellerManagedDelivery && <li>{product.policies.sellerManagedDelivery}</li>}
              </ul>
            </details>}
          </div>

          {detailStatus === "error" && <p className="form-error" role="alert">Full size and policy details could not be loaded. Try again before ordering.</p>}
          {detailStatus === "unavailable" && <p className="form-error" role="alert">This florist slot changed while you were browsing. Refresh the results for current options.</p>}
          <button className="primary-button product-dialog__cta" type="button" onClick={detailStatus === "error" ? onRetry : detailStatus === "unavailable" ? onRefresh : onAdd} disabled={detailStatus === "loading" || detailStatus === "idle"}>
            <span>{detailStatus === "loading" || detailStatus === "idle" ? "Loading full details…" : detailStatus === "error" ? "Try loading details again" : detailStatus === "unavailable" ? "Refresh available flowers" : `Add to basket · ${formatSgd(product.priceCents)}`}</span>
            <span className="button-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function CartDrawer({
  item,
  notice,
  onClose,
  onClear,
  onCheckout,
}: {
  item: CartItem | null;
  notice: string;
  onClose: () => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  const product = item?.product ?? null;
  const method = item?.plan.method ?? "delivery";
  const date = item?.plan.date ?? "";
  const dialogRef = useRef<HTMLElement>(null);
  useAccessibleDialog({ containerRef: dialogRef, onClose });
  const total = product ? product.priceCents + (method === "delivery" ? product.deliveryFeeCents : 0) : 0;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dialogRef} tabIndex={-1} className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="basket-title">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">One florist per order</p>
            <h2 id="basket-title">Basket</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Close basket">×</button>
        </div>
        {notice && <p className="cart-notice" aria-live="polite">{notice}</p>}
        {product ? (
          <>
            <div className="cart-line">
              <img src={product.imageUrl} alt="" />
              <div>
                <strong>{product.name}</strong>
                <span>{product.sellerName}</span>
                <span>Qty 1 · {formatSgd(product.priceCents)}</span>
              </div>
              <button type="button" onClick={onClear}>Remove</button>
            </div>
            <dl className="cart-totals">
              <div><dt>Arrangement</dt><dd>{formatSgd(product.priceCents)}</dd></div>
              <div><dt>{method === "delivery" ? "Seller delivery" : "Self-pickup"}</dt><dd>{method === "delivery" ? formatSgd(product.deliveryFeeCents) : "Free"}</dd></div>
              <div className="cart-total"><dt>Total</dt><dd>{formatSgd(total)}</dd></div>
            </dl>
            <div className="cart-plan">
              <span>{method === "delivery" ? "Delivery" : "Pickup"}</span>
              <strong>{date} · {product.availableWindows[0]}</strong>
              {method === "pickup" && product.pickupLabel && <small>{product.pickupLabel}</small>}
            </div>
            <button className="primary-button cart-checkout" type="button" onClick={onCheckout}>
              <span>Continue to checkout</span><span className="button-arrow" aria-hidden="true">→</span>
            </button>
            <p className="checkout-caption">Demo only. No payment is taken.</p>
          </>
        ) : (
          <div className="empty-cart">
            <div className="empty-results__shape" aria-hidden="true" />
            <h3>Your basket is waiting.</h3>
            <p>Choose an arrangement to continue.</p>
            <button className="secondary-button" type="button" onClick={onClose}>Browse available flowers</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function CheckoutDialog({
  item,
  onClose,
  onAvailabilityChanged,
}: {
  item: CartItem;
  onClose: () => void;
  onAvailabilityChanged: () => void;
}) {
  const { product, plan } = item;
  const { method, date, postcode } = plan;
  const dialogRef = useRef<HTMLElement>(null);
  useAccessibleDialog({ containerRef: dialogRef, onClose });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const requestKey = useRef("");
  const retryStorageKey = `petalfolk:checkout-retry:${product.id}:${method}:${date}:${postcode}`;
  const total = product.priceCents + (method === "delivery" ? product.deliveryFeeCents : 0);

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) {
      setError("Confirm that you may share the fulfilment contact details for this order.");
      window.requestAnimationFrame(() => consentRef.current?.focus());
      return;
    }
    setIsSubmitting(true);
    setError("");
    setFieldErrors({});
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!requestKey.current) requestKey.current = persistentRetryKey(retryStorageKey);
    const payload = {
      productId: product.id,
      quantity: 1,
      fulfilmentMethod: method,
      method,
      fulfilmentDate: date,
      date,
      fulfilmentWindow: String(form.get("fulfilmentWindow") ?? product.availableWindows[0]),
      window: String(form.get("fulfilmentWindow") ?? product.availableWindows[0]),
      postcode: method === "delivery" ? String(form.get("postcode") ?? postcode) : "",
      addressLine: String(form.get("addressLine") ?? ""),
      deliveryInstructions: String(form.get("deliveryInstructions") ?? ""),
      buyerName: String(form.get("buyerName") ?? ""),
      buyerEmail: String(form.get("buyerEmail") ?? ""),
      recipientName: String(form.get("recipientName") ?? ""),
      recipientPhone: String(form.get("recipientPhone") ?? ""),
      cardMessage: String(form.get("cardMessage") ?? ""),
      recipientConsent: true,
      idempotencyKey: requestKey.current,
    };

    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": payload.idempotencyKey,
        },
        body: JSON.stringify({
          ...payload,
          requestedDate: date,
          window: payload.fulfilmentWindow,
          buyer: {
            name: payload.buyerName,
            email: payload.buyerEmail,
          },
          recipient: {
            name: payload.recipientName,
            phone: payload.recipientPhone,
            address: payload.addressLine,
            addressLine: payload.addressLine,
            postcode: payload.postcode,
          },
          giftMessage: payload.cardMessage,
          deliveryInstructions: payload.deliveryInstructions,
        }),
      });
      const data = (await response.json()) as {
        order?: { id?: string };
        id?: string;
        error?: string | {
          code?: string;
          message?: string;
          fieldErrors?: Record<string, string>;
          recovery?: string;
          retryable?: boolean;
        };
      };
      if (!response.ok) {
        const apiError = typeof data.error === "string" ? undefined : data.error;
        if (response.status === 409 && apiError?.retryable) {
          requestKey.current = "";
          clearRetryKey(retryStorageKey);
          setIsSubmitting(false);
          onAvailabilityChanged();
          return;
        }
        const nextFieldErrors = checkoutFieldErrors(apiError?.fieldErrors);
        setFieldErrors(nextFieldErrors);
        const message = typeof data.error === "string" ? data.error : apiError?.message;
        setError(
          [message ?? "The order could not be placed.", apiError?.recovery]
            .filter(Boolean)
            .join(" "),
        );
        if (response.status < 500) {
          requestKey.current = "";
          clearRetryKey(retryStorageKey);
        }
        const firstField = Object.keys(nextFieldErrors)[0];
        if (firstField) {
          window.requestAnimationFrame(() => {
            const control = formElement.elements.namedItem(firstField);
            if (control instanceof HTMLElement) control.focus();
          });
        }
        setIsSubmitting(false);
        return;
      }
      const orderId = data.order?.id ?? data.id;
      if (!orderId) throw new Error("The order was created without a tracking reference.");
      clearRetryKey(retryStorageKey);
      window.location.assign(`/order/${orderId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The order could not be placed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop checkout-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close checkout">×</button>
        <div className="checkout-dialog__intro">
          <p className="eyebrow">Demo checkout</p>
          <h2 id="checkout-title">{method === "delivery" ? "Delivery details" : "Pickup details"}</h2>
          <p>Enter the details needed for fulfilment. No real payment is collected.</p>
        </div>
        <form
          ref={formRef}
          onSubmit={submitOrder}
          className="checkout-form"
          aria-busy={isSubmitting}
          onChange={(event) => {
            if (error) setError("");
            const target = event.target;
            if (
              !(target instanceof HTMLInputElement) &&
              !(target instanceof HTMLSelectElement) &&
              !(target instanceof HTMLTextAreaElement)
            ) return;
            if (!target.name || !fieldErrors[target.name]) return;
            setFieldErrors((current) => {
              const next = { ...current };
              delete next[target.name];
              return next;
            });
          }}
        >
          <fieldset>
            <legend>Your details</legend>
            <div className="form-grid">
              <label><span>Your name</span><input name="buyerName" autoComplete="name" defaultValue="Jamie Lim" required aria-invalid={Boolean(fieldErrors.buyerName)} aria-describedby={fieldErrors.buyerName ? "buyerName-error" : undefined} />{fieldErrors.buyerName && <small className="field-error" id="buyerName-error">{fieldErrors.buyerName}</small>}</label>
              <label><span>Email</span><input name="buyerEmail" type="email" autoComplete="email" defaultValue="jamie@example.com" required aria-invalid={Boolean(fieldErrors.buyerEmail)} aria-describedby={fieldErrors.buyerEmail ? "buyerEmail-error" : undefined} />{fieldErrors.buyerEmail && <small className="field-error" id="buyerEmail-error">{fieldErrors.buyerEmail}</small>}</label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{method === "delivery" ? "Recipient" : "Collector"}</legend>
            <div className="form-grid">
              <label><span>{method === "delivery" ? "Recipient name" : "Collector name"}</span><input name="recipientName" autoComplete="off" defaultValue="Alicia Tan" required aria-invalid={Boolean(fieldErrors.recipientName)} aria-describedby={fieldErrors.recipientName ? "recipientName-error" : undefined} />{fieldErrors.recipientName && <small className="field-error" id="recipientName-error">{fieldErrors.recipientName}</small>}</label>
              <label><span>{method === "delivery" ? "Recipient phone" : "Collector phone"}</span><input name="recipientPhone" type="tel" inputMode="tel" defaultValue="9123 4821" required aria-invalid={Boolean(fieldErrors.recipientPhone)} aria-describedby={fieldErrors.recipientPhone ? "recipientPhone-error" : undefined} />{fieldErrors.recipientPhone && <small className="field-error" id="recipientPhone-error">{fieldErrors.recipientPhone}</small>}</label>
              {method === "delivery" && (
                <>
                  <label className="form-grid__wide"><span>Delivery address</span><input name="addressLine" autoComplete="street-address" defaultValue="20 Tiong Bahru Road" required aria-invalid={Boolean(fieldErrors.addressLine)} aria-describedby={fieldErrors.addressLine ? "addressLine-error" : undefined} />{fieldErrors.addressLine && <small className="field-error" id="addressLine-error">{fieldErrors.addressLine}</small>}</label>
                  <label>
                    <span>Verified postal code</span>
                    <input name="postcode" inputMode="numeric" pattern="[0-9]{6}" value={postcode} readOnly required aria-invalid={Boolean(fieldErrors.postcode)} aria-describedby={fieldErrors.postcode ? "postcode-error postcode-hint" : "postcode-hint"} />
                    <small className="field-hint" id="postcode-hint">From your availability search. Close checkout to change it.</small>
                    {fieldErrors.postcode && <small className="field-error" id="postcode-error">{fieldErrors.postcode}</small>}
                  </label>
                  <label className="form-grid__wide"><span>Delivery instructions <small>(optional)</small></span><textarea name="deliveryInstructions" rows={2} maxLength={500} placeholder="For example: call the recipient on arrival" aria-invalid={Boolean(fieldErrors.deliveryInstructions)} aria-describedby={fieldErrors.deliveryInstructions ? "deliveryInstructions-error" : undefined} />{fieldErrors.deliveryInstructions && <small className="field-error" id="deliveryInstructions-error">{fieldErrors.deliveryInstructions}</small>}</label>
                </>
              )}
              <label><span>{method === "delivery" ? "Delivery window" : "Pickup window"}</span>
                <select name="fulfilmentWindow" defaultValue={product.availableWindows[0]} aria-invalid={Boolean(fieldErrors.fulfilmentWindow)} aria-describedby={fieldErrors.fulfilmentWindow ? "fulfilmentWindow-error" : undefined}>
                  {product.availableWindows.map((window) => <option key={window}>{window}</option>)}
                </select>
                {fieldErrors.fulfilmentWindow && <small className="field-error" id="fulfilmentWindow-error">{fieldErrors.fulfilmentWindow}</small>}
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Gift details</legend>
            <div className="form-grid">
              <label className="form-grid__wide"><span>Message card <small>(optional)</small></span><textarea name="cardMessage" rows={3} placeholder="Write a short note" maxLength={240} aria-invalid={Boolean(fieldErrors.cardMessage)} aria-describedby={fieldErrors.cardMessage ? "cardMessage-error" : undefined} />{fieldErrors.cardMessage && <small className="field-error" id="cardMessage-error">{fieldErrors.cardMessage}</small>}</label>
            </div>
          </fieldset>

          <label className="consent-check">
            <input ref={consentRef} type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(""); }} />
            <span>I may share these fulfilment contact details for this order.</span>
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="checkout-review">
            <div>
              <span>{product.name} · {product.sellerName}</span>
              <strong>{method === "delivery" ? "Delivery" : "Pickup"} on {date}</strong>
              {method === "pickup" && product.pickupLabel && <small>{product.pickupLabel}</small>}
            </div>
            <div><span>Final total</span><strong>{formatSgd(total)}</strong></div>
          </div>
          <button className="primary-button checkout-submit" type="submit" disabled={isSubmitting}>
            <span aria-live="polite">{isSubmitting ? "Requesting order…" : `Request order · ${formatSgd(total)}`}</span>
            <span className="button-arrow" aria-hidden="true">→</span>
          </button>
          <p className="checkout-caption">The florist has {product.confirmationMinutes ?? 60} minutes to confirm. No charge is taken if they decline.</p>
        </form>
      </section>
    </div>
  );
}
