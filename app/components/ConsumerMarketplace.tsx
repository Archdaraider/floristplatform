"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PreviewNav } from "./PreviewNav";
import {
  formatSgd,
  FulfilmentMethod,
  Product,
  Seller,
} from "./mvp-types";

const DEFAULT_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=1200&q=86";

function getDefaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeProduct(raw: Record<string, unknown>): Product {
  const seller = (raw.seller ?? {}) as Record<string, unknown>;
  const availability = (raw.availability ?? {}) as Record<string, unknown>;
  const methods = (raw.fulfilmentMethods ?? raw.fulfillmentMethods ?? raw.methods ?? ["delivery"]) as FulfilmentMethod[];
  return {
    id: String(raw.id ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    sellerId: String(raw.sellerId ?? seller.id ?? ""),
    sellerName: String(raw.sellerName ?? seller.name ?? seller.tradingName ?? "Independent florist"),
    sellerArea: String(raw.sellerArea ?? seller.area ?? seller.publicArea ?? availability.publicArea ?? "Singapore"),
    sellerType: String(raw.sellerType ?? seller.sellerType ?? "Independent florist"),
    verified: Boolean(raw.verified ?? seller.verified ?? true),
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
    availableWindows: Array.isArray(raw.availableWindows)
      ? (raw.availableWindows as string[])
      : availability.window ? [String(availability.window)] : ["10am–2pm"],
    rating: Number(raw.rating ?? 4.8),
    reviewCount: Number(raw.reviewCount ?? 0),
    stemCount: raw.stemCount ? String(raw.stemCount) : "Seasonal stem count varies",
    includedItems: Array.isArray(raw.includedItems)
      ? (raw.includedItems as string[])
      : ["Seasonal arrangement", "Message card", "Gift wrap"],
    status: (raw.status as Product["status"]) ?? "published",
    representativePhoto: Boolean(raw.representativePhoto ?? true),
  };
}

export function ConsumerMarketplace() {
  const [date, setDate] = useState(getDefaultDate);
  const [method, setMethod] = useState<FulfilmentMethod>("delivery");
  const [postcode, setPostcode] = useState("168732");
  const [budget, setBudget] = useState("140");
  const [style, setStyle] = useState("All styles");
  const [occasion, setOccasion] = useState("birthday");
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchNote, setSearchNote] = useState("Showing florist availability for your plan.");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartProduct, setCartProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");

  const searchParams = useMemo(
    () =>
      new URLSearchParams({
        date,
        method,
        postcode,
        budget,
        style: style === "All styles" ? "" : style,
        occasion,
      }),
    [budget, date, method, occasion, postcode, style],
  );

  async function searchCatalogue() {
    setIsLoading(true);
    setSearchNote("Checking each florist’s date, capacity, and service area…");
    try {
      const response = await fetch(`/api/v1/catalog?${searchParams.toString()}`);
      if (!response.ok) throw new Error("Catalogue unavailable");
      const data = (await response.json()) as {
        products?: Record<string, unknown>[];
        sellers?: Seller[];
      };
      const nextProducts = (data.products ?? []).map(normalizeProduct);
      setProducts(nextProducts);
      if (data.sellers?.length) {
        setSellers(data.sellers.map((seller) => {
          const raw = seller as unknown as Record<string, unknown>;
          return {
            id: String(raw.id ?? ""),
            name: String(raw.name ?? raw.tradingName ?? "Independent florist"),
            slug: raw.slug ? String(raw.slug) : undefined,
            area: String(raw.area ?? raw.publicArea ?? "Singapore"),
            sellerType: String(raw.sellerType ?? "Independent florist"),
            verified: String(raw.verificationStatus ?? "verified") === "verified",
            acceptingOrders: Boolean(raw.acceptingOrders ?? raw.acceptingNewOrders ?? true),
            story: raw.publicStory ? String(raw.publicStory) : undefined,
          };
        }));
      }
      setSearchNote(
        nextProducts.length
          ? `${nextProducts.length} arrangements can be fulfilled for this plan.`
          : "Nothing fits every part of this plan yet. Try another date, method, or budget.",
      );
    } catch {
      setProducts([]);
      setSellers([]);
      setSearchNote("The availability service could not be reached. Check the demo server, then try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void searchCatalogue(), 0);
    return () => window.clearTimeout(initialLoad);
    // Initial availability check only; subsequent searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addToCart(product: Product) {
    if (cartProduct && cartProduct.sellerId !== product.sellerId) {
      setCartNotice(
        `Your basket is with ${cartProduct.sellerName}. Clear it before ordering from ${product.sellerName}; each order belongs to one florist.`,
      );
      setSelectedProduct(null);
      setCartOpen(true);
      return;
    }
    setCartProduct(product);
    setCartNotice(`${product.name} is in your basket. Availability will be checked again at checkout.`);
    setSelectedProduct(null);
    setCartOpen(true);
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
            aria-label={cartProduct ? "Open basket with one item" : "Open empty basket"}
          >
            Basket <span>{cartProduct ? "1" : "0"}</span>
          </button>
        </nav>
      </header>

      <section className="market-hero page-shell">
        <div className="market-hero__copy reveal-block">
          <p className="eyebrow">Independent florists · Singapore</p>
          <h1>
            Flowers that can <em>actually arrive</em> when you need them.
          </h1>
          <p className="hero-intro">
            Search by date and postcode first. We show only arrangements a florist can make,
            deliver, or have ready for pickup.
          </p>

          <form
            className="availability-form"
            onSubmit={(event) => {
              event.preventDefault();
              void searchCatalogue();
              document.querySelector("#available")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
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

            <div className="availability-fields">
              <label>
                <span>Date</span>
                <input type="date" value={date} min={getDefaultDate()} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label>
                <span>{method === "delivery" ? "Delivery postcode" : "Your postcode"}</span>
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
              <label>
                <span>Occasion</span>
                <select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                  <option value="birthday">Birthday</option>
                  <option value="romance">Romance</option>
                  <option value="congratulations">Congratulations</option>
                  <option value="thank-you">Thank you</option>
                  <option value="housewarming">Housewarming</option>
                </select>
              </label>
              <button className="primary-button search-button" type="submit" disabled={isLoading}>
                <span>{isLoading ? "Checking…" : "Find available flowers"}</span>
                <span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </form>
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
          <span>Availability checked at checkout</span>
          <span>Prices shown in SGD</span>
          <span>Seller-managed fulfilment</span>
          <span>Simulated payment states</span>
        </div>
      </section>

      <section id="available" className="catalogue-section page-shell">
        <div className="section-heading reveal-block">
          <div>
            <p className="eyebrow">Available for your plan</p>
            <h2>Arrangements with a real path to your door.</h2>
          </div>
          <p className="results-context" aria-live="polite">{searchNote}</p>
        </div>

        <div className="catalogue-controls" aria-label="Filter available arrangements">
          <label className="compact-select">
            <span>Style</span>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {availableStyles.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="budget-control">
            <span>Up to {formatSgd(Number(budget) * 100)}</span>
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
          <button className="text-button" type="button" onClick={() => void searchCatalogue()} disabled={isLoading}>
            Apply filters
          </button>
        </div>

        {isLoading ? (
          <div className="product-grid" aria-label="Loading florist availability">
            {[0, 1, 2, 3].map((item) => <div className="product-skeleton" key={item} />)}
          </div>
        ) : products.length ? (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card reveal-block" style={{ "--item-index": index } as React.CSSProperties} key={product.id}>
                <button className="product-card__image" type="button" onClick={() => setSelectedProduct(product)} aria-label={`View ${product.name}`}>
                  <img src={product.imageUrl} alt={product.imageAlt ?? `${product.name} floral arrangement`} />
                  <span className="availability-badge">
                    {product.capacityRemaining === 1 ? "Last slot" : `${product.capacityRemaining} slots left`}
                  </span>
                </button>
                <div className="product-card__body">
                  <div className="product-card__seller">
                    <span>{product.sellerName}</span>
                    {product.verified && <span className="verified-mark" title="Manually reviewed florist">Verified</span>}
                  </div>
                  <button className="product-title-button" type="button" onClick={() => setSelectedProduct(product)}>
                    <span>{product.name}</span>
                    <strong>{formatSgd(product.priceCents)}</strong>
                  </button>
                  <p>{product.description}</p>
                  <div className="product-card__meta">
                    <span>{product.style}</span>
                    <span>{product.sellerArea}</span>
                    <span>{method === "delivery" ? `Delivery ${formatSgd(product.deliveryFeeCents)}` : "Pickup · free"}</span>
                  </div>
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
              <button className="secondary-button" type="button" onClick={() => { setStyle("All styles"); setBudget("160"); setOccasion("birthday"); }}>
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
            Every beta florist is reviewed before going live. Home addresses stay private, and
            pickup appears only where the seller and platform have approved it.
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
            <p>A working closed-beta concept for Singapore’s independent florists.</p>
          </div>
          <div>
            <span className="footer-label">MVP pathways</span>
            <Link href="/seller">Seller dashboard</Link>
            <Link href="/admin">Operations console</Link>
          </div>
          <div>
            <span className="footer-label">Beta note</span>
            <p>Payments and notifications are simulated. Do not enter real payment details.</p>
            <div className="footer-legal"><Link href="/privacy">Privacy notes</Link><Link href="/terms">Beta terms</Link></div>
          </div>
        </div>
      </footer>

      {selectedProduct && (
        <ProductDialog
          product={selectedProduct}
          method={method}
          date={date}
          onClose={() => setSelectedProduct(null)}
          onAdd={() => addToCart(selectedProduct)}
        />
      )}

      {cartOpen && (
        <CartDrawer
          product={cartProduct}
          method={method}
          date={date}
          notice={cartNotice}
          onClose={() => setCartOpen(false)}
          onClear={() => { setCartProduct(null); setCartNotice("Your basket is clear."); }}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
        />
      )}

      {checkoutOpen && cartProduct && (
        <CheckoutDialog
          product={cartProduct}
          method={method}
          date={date}
          postcode={postcode}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </main>
  );
}

function ProductDialog({
  product,
  method,
  date,
  onClose,
  onAdd,
}: {
  product: Product;
  method: FulfilmentMethod;
  date: string;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close product details">×</button>
        <div className="product-dialog__image">
          <img src={product.imageUrl} alt={`${product.name} arrangement`} />
          {product.representativePhoto && <span>Representative seasonal photo</span>}
        </div>
        <div className="product-dialog__content">
          <p className="eyebrow">{product.sellerName} · {product.sellerArea}</p>
          <h2 id="product-dialog-title">{product.name}</h2>
          <div className="product-dialog__price">
            <strong>{formatSgd(product.priceCents)}</strong>
            <span>{product.stemCount}</span>
          </div>
          <p className="product-dialog__description">{product.description}</p>

          <div className="fulfilment-summary">
            <span className="fulfilment-summary__label">Your plan</span>
            <div>
              <strong>{method === "delivery" ? "Seller-arranged delivery" : "Self-pickup"}</strong>
              <span>{date} · {product.availableWindows[0]}</span>
              <span>{method === "delivery" ? `${formatSgd(product.deliveryFeeCents)} delivery fee` : product.pickupLabel}</span>
            </div>
          </div>

          <div className="product-detail-grid">
            <div>
              <span className="detail-label">Included</span>
              <ul>{product.includedItems?.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <span className="detail-label">Before you order</span>
              <ul>
                <li>{product.leadTimeHours}-hour minimum lead time</li>
                <li>Florist confirms within 60 minutes</li>
                <li>Seasonal substitutions need your approval</li>
              </ul>
            </div>
          </div>

          <div className="policy-note">
            <strong>Freshness and fulfilment</strong>
            <p>The florist is responsible for the arrangement and seller-managed delivery. Material substitutions are never made silently.</p>
          </div>

          <button className="primary-button product-dialog__cta" type="button" onClick={onAdd}>
            <span>Add to basket · {formatSgd(product.priceCents)}</span>
            <span className="button-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function CartDrawer({
  product,
  method,
  date,
  notice,
  onClose,
  onClear,
  onCheckout,
}: {
  product: Product | null;
  method: FulfilmentMethod;
  date: string;
  notice: string;
  onClose: () => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  const total = product ? product.priceCents + (method === "delivery" ? product.deliveryFeeCents : 0) : 0;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="basket-title">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">One florist per order</p>
            <h2 id="basket-title">Your basket</h2>
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
            </div>
            <button className="primary-button cart-checkout" type="button" onClick={onCheckout}>
              <span>Continue to checkout</span><span className="button-arrow" aria-hidden="true">→</span>
            </button>
            <p className="checkout-caption">No charge is made now. This demo simulates card authorisation and captures only when the florist accepts.</p>
          </>
        ) : (
          <div className="empty-cart">
            <div className="empty-results__shape" aria-hidden="true" />
            <h3>Your basket is waiting.</h3>
            <p>Choose one arrangement and we will recheck its date, capacity, and fulfilment before placing the order.</p>
            <button className="secondary-button" type="button" onClick={onClose}>Browse available flowers</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function CheckoutDialog({
  product,
  method,
  date,
  postcode,
  onClose,
}: {
  product: Product;
  method: FulfilmentMethod;
  date: string;
  postcode: string;
  onClose: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const total = product.priceCents + (method === "delivery" ? product.deliveryFeeCents : 0);

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) {
      setError("Confirm that you may share the recipient details for this order.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
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
      buyerName: String(form.get("buyerName") ?? ""),
      buyerEmail: String(form.get("buyerEmail") ?? ""),
      recipientName: String(form.get("recipientName") ?? ""),
      recipientPhone: String(form.get("recipientPhone") ?? ""),
      cardMessage: String(form.get("cardMessage") ?? ""),
      recipientConsent: true,
      idempotencyKey: crypto.randomUUID(),
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
          deliveryInstructions: "Please call the recipient on arrival.",
        }),
      });
      const data = (await response.json()) as {
        order?: { id?: string };
        id?: string;
        error?: string | { message?: string };
      };
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : data.error?.message;
        throw new Error(message ?? "The order could not be placed.");
      }
      const orderId = data.order?.id ?? data.id;
      if (!orderId) throw new Error("The order was created without a tracking reference.");
      window.location.assign(`/order/${orderId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The order could not be placed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop checkout-backdrop" role="presentation">
      <section className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close checkout">×</button>
        <div className="checkout-dialog__intro">
          <p className="eyebrow">Secure demo checkout</p>
          <h2 id="checkout-title">Who is this arrangement for?</h2>
          <p>Buyer and recipient details stay separate. No real payment information is collected in this prototype.</p>
        </div>
        <form onSubmit={submitOrder} className="checkout-form">
          <fieldset>
            <legend>Your details</legend>
            <div className="form-grid">
              <label><span>Your name</span><input name="buyerName" autoComplete="name" defaultValue="Jamie Lim" required /></label>
              <label><span>Email for order access</span><input name="buyerEmail" type="email" autoComplete="email" defaultValue="jamie@example.com" required /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Recipient</legend>
            <div className="form-grid">
              <label><span>Recipient name</span><input name="recipientName" autoComplete="off" defaultValue="Alicia Tan" required /></label>
              <label><span>Recipient phone</span><input name="recipientPhone" type="tel" inputMode="tel" defaultValue="9123 4821" required /></label>
              {method === "delivery" && (
                <>
                  <label className="form-grid__wide"><span>Delivery address</span><input name="addressLine" autoComplete="street-address" defaultValue="20 Tiong Bahru Road" required /></label>
                  <label><span>Postal code</span><input name="postcode" inputMode="numeric" pattern="[0-9]{6}" defaultValue={postcode} required /></label>
                </>
              )}
              <label><span>{method === "delivery" ? "Delivery window" : "Pickup window"}</span>
                <select name="fulfilmentWindow" defaultValue={product.availableWindows[0]}>
                  {product.availableWindows.map((window) => <option key={window}>{window}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Gift details</legend>
            <div className="form-grid">
              <label className="form-grid__wide"><span>Message card</span><textarea name="cardMessage" rows={3} defaultValue="Thinking of you today. — Jamie" maxLength={240} /></label>
              <p className="form-grid__wide policy-note">If a flower becomes unavailable, the florist must ask before making any material substitution.</p>
            </div>
          </fieldset>

          <label className="consent-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I am authorised to provide these recipient details for fulfilment of this order.</span>
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="checkout-review">
            <div>
              <span>{product.name} · {product.sellerName}</span>
              <strong>{method === "delivery" ? "Delivery" : "Pickup"} on {date}</strong>
            </div>
            <div><span>Final total</span><strong>{formatSgd(total)}</strong></div>
          </div>
          <button className="primary-button checkout-submit" type="submit" disabled={isSubmitting}>
            <span>{isSubmitting ? "Reserving florist capacity…" : `Authorise ${formatSgd(total)} & request order`}</span>
            <span className="button-arrow" aria-hidden="true">→</span>
          </button>
          <p className="checkout-caption">The florist has 60 minutes to accept. The simulated authorisation is captured only on acceptance and voided if declined.</p>
        </form>
      </section>
    </div>
  );
}
