# Petalfolk — Singapore florist marketplace MVP

Petalfolk is a working-name prototype for a curated marketplace of independent Singapore florists. It turns the two source documents in this repository into a demonstrable buyer, seller, and marketplace-operations vertical slice.

The product promise is deliberately narrow:

> Show flowers that a real florist can fulfil for this date, postcode, method, window, and budget—before the buyer reaches payment.

This repository is a functional product prototype, not a production-ready marketplace. It uses durable local D1 data and real domain state transitions, while payment, identity, notification, payout, geocoding, and protected-data infrastructure remain simulated or represented behind clear boundaries.

## Start the MVP

Requirements:

- Node.js 22.13 or newer
- npm

```bash
npm install
npm run dev
```

Open the local URL printed by the development server, normally `http://localhost:3000`.

The primary pathways are:

- Consumer marketplace: `/`
- Seller studio: `/seller`
- Marketplace operations: `/admin`
- Buyer order tracking: `/order/:id` after checkout

The application is also configured as an installable PWA with a manifest, service worker, and seller/consumer shortcuts.

## Recommended demo

1. Open the consumer marketplace.
2. Search delivery using the prefilled Singapore postcode and a future date.
3. Open an arrangement, review fulfilment and substitution context, and add it to the basket.
4. Complete the demo checkout. The app revalidates availability, reserves capacity, creates an immutable order snapshot, and simulates payment authorisation.
5. From the tracking page, open the seller pathway.
6. Select the newest request and choose **Accept & capture payment**.
7. Continue through preparation, ready, courier, delivered, and fulfilment actions.
8. Return to the buyer order URL to see the updated simplified status and append-only timeline.
9. Use the order thread to send a labelled buyer message.
10. In the seller studio, verify the destination, delivery instructions, and shared conversation before fulfilment.
11. Open `/admin` to see seller review, exception, financial-boundary, and audit-timeline projections.

The black preview bar at the top of every main screen switches between consumer, seller, and operations pathways.

## What works in this version

### Consumer pathway

- Required search context: date, delivery or pickup, and postcode
- Optional occasion, style, and budget filters
- One canonical availability calculation used by catalogue, product detail, and checkout
- Postal-sector serviceability, seller/product state, lead time, daily capacity, method, and price checks
- Bookable-only results with real zero-result handling
- Product fulfilment, lead-time, representative-photo, substitution, and seller-responsibility context
- One-florist-per-order basket guardrail
- Submitted availability plan stays attached to its results, basket, total, and checkout even while draft search controls change
- Buyer and recipient details collected separately, with optional delivery instructions supplied by the buyer
- Final SGD price including seller-managed delivery
- Idempotent order creation and immutable product, policy, fee, and price snapshots
- Stable checkout retry key, canonical server-owned fulfilment window, and field-level recovery errors
- Manual acceptance flow: simulated authorise at checkout, capture on seller acceptance, void on decline
- Buyer-safe tracking projection, labelled order messages, and append-only activity
- Home-seller public area without a private address payload

### Seller pathway

- Deadline-sorted action queue rather than a generic order table
- New-request, active-order, capacity, and payout signals
- Guarded delivery and pickup state transitions
- Accept, decline, prepare, ready, courier, deliver, and fulfil actions
- Idempotent seller transitions and simulated payment/payout side effects
- Order detail with separate buyer, recipient, gift-message, and fulfilment context
- Authorised delivery destination, delivery instructions, and a two-way order conversation in the seller workspace
- Catalogue publish/pause controls that do not mutate historical order snapshots
- Seller intake pause/resume that preserves confirmed obligations
- Seven-day capacity projection and represented fulfilment configuration

### Operations pathway

- Seller verification and renewal-review projection
- Fulfilment exception queue with severity, owner, and deadline
- Recent append-only order events
- Captured and authorised marketplace metrics
- Explicit protected-address access boundary
- Clear reminder that approval mutations, refunds, and live financial actions require production role checks and audit records

### Platform foundation

- Responsive React/TypeScript UI for mobile, tablet, and desktop
- Warm editorial design system using Geist, Geist Mono, and Instrument Serif
- Keyboard focus states, trapped/restored modal focus, Escape handling, background inerting, scroll lock, skip navigation, semantic landmarks, 44px touch targets, reduced-motion support, loading/empty/error states, and non-colour status labels
- Versioned `/api/v1` routes
- D1/SQLite persistence with Drizzle schema and generated migration
- Capacity constraints, order-scoped command idempotency, payload-conflict detection, and append-only order events/messages
- Strict runtime validation for untrusted JSON, deterministic delivery-zone selection, and canonical window/fee snapshots
- Idempotent lazy expiry reconciliation that voids timed-out demo authorisations and releases capacity
- Singapore timezone and SGD money conventions
- PWA manifest, icons, public static-asset caching, a branded offline fallback, and route shortcuts; order, seller, admin, API, private, and `no-store` responses are excluded from runtime caching
- Branded metadata, policy-note pages, favicon, and custom not-found page

## Architecture

```text
Buyer / Seller / Operations UI
              │
        Next-style routes
              │
      /api/v1 route handlers
              │
  typed domain services in lib/
              │
 Cloudflare D1 + Drizzle schema
```

The current implementation uses the Sites-compatible vinext runtime (React 19, Next-compatible app routing, TypeScript, Tailwind CSS 4, Cloudflare D1, and Drizzle). Business logic lives outside page components:

- `lib/availability.ts` — canonical search and checkout eligibility
- `lib/orders.ts` — order creation, state guards, idempotency, payment simulation, events, and messages
- `lib/seller.ts` — seller dashboard, catalogue state, capacity, and intake settings
- `lib/admin.ts` — review, exception, financial, and audit projections
- `db/bootstrap.ts` — idempotent local schema setup and realistic Singapore seed data
- `db/schema.ts` — relational Drizzle schema and constraints
- `drizzle/` — generated SQL migration

The D1 binding is declared logically as `DB` in `.openai/hosting.json`. Local development keeps data in project-local Wrangler state. The seed routine is idempotent, so restarting the development server preserves demo changes rather than duplicating records.

## Three deep-dive improvements

The July 2026 regression pass consolidated the fixes into three project-level improvements:

1. **Server trust and transaction integrity.** All order/message/action payloads are checked at runtime, idempotent replays are scoped and payload-matched, delivery zones and windows are server-derived, pickup snapshots cannot carry a delivery zone, and expired reservations release capacity with one event/message. The PWA cache now excludes protected and dynamic routes.
2. **One verified buyer plan.** Catalogue results, product details, basket pricing, and checkout use the exact submitted date/method/postcode plan. Editing draft controls cannot relabel stale products, filter reset re-runs availability, overlapping requests cannot overwrite the newest result, and retry keys survive ambiguous network failures.
3. **Reliable, accessible live operations.** Seller selection cannot act on a previously selected order, delivery data and messages are available at handoff, buyer tracking remains monotonic through courier states and survives transient polling failure, operational empty states never invent records, and every modal/drawer traps focus, closes with Escape, restores focus, and exposes inline checkout errors.

## Implemented API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/catalog` | Availability-aware catalogue search |
| `GET` | `/api/v1/products/:slug` | Product detail using the same availability context |
| `PATCH` | `/api/v1/products/:id` | Main demo seller publish/pause command |
| `POST` | `/api/v1/orders` | Revalidate, reserve capacity, authorise, and create an order |
| `GET` | `/api/v1/orders/:id` | Buyer-safe order, events, and messages |
| `PATCH` | `/api/v1/orders/:id` | Guarded seller order transition |
| `POST` | `/api/v1/orders/:id/messages` | Labelled order-scoped message |
| `GET` | `/api/v1/seller/dashboard` | Seller action queue, products, capacity, and metrics |
| `PATCH` | `/api/v1/seller/settings` | Pause or resume new intake |
| `GET` | `/api/v1/admin/dashboard` | Seller review, exception, financial, and audit projection |

The machine-readable contract is in [`docs/openapi.yaml`](docs/openapi.yaml). Every mutation that can duplicate a commercial effect accepts an `Idempotency-Key` header.

## Validation commands

```bash
npm run typecheck
npm run lint
npm test
npm audit --omit=dev
```

The production dependency audit is clean. The full development-tree audit still reports four moderate advisories through the current `drizzle-kit` → legacy `esbuild` toolchain; `drizzle-kit` 0.31.10 is already the latest release, and npm's offered fix is an incompatible downgrade. Keep the local development server bound to trusted interfaces until that upstream chain is replaced.

With the development server running, exercise the complete persisted order lifecycle:

```bash
npm run smoke
```

The smoke test proves:

- a bookable product is found through the canonical engine;
- a home seller does not expose a public exact address;
- an approved pickup seller exposes only its public collection location;
- order retries return the same order;
- acceptance captures the simulated authorisation once;
- decline voids the simulated authorisation and releases reserved capacity;
- guarded delivery and pickup states reach completion;
- material actions create an append-only event trail; and
- order-scoped messaging persists.

`npm test` also runs eight rendered-route and API guardrail checks, including malformed JSON returning `422`, cross-order idempotency isolation, concurrent exact-retry serialization, changed-payload conflicts, tampered-window rejection, plan-snapshot source guards, keyboard-dialog guards, and private-route service-worker exclusions.

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Deliberate prototype boundaries

Do not use this build for real buyers, sellers, payments, or recipient data. The following production requirements are not complete:

- Supabase Auth, guest magic links, MFA, RLS, and buyer/seller/admin tenant isolation
- Field-level encryption and audited time-bound access for recipient and private seller addresses
- PostgreSQL/PostGIS in a Singapore region and transactional row locking for final-slot contention
- A licensed marketplace PSP integration, connected accounts, signed webhooks, refunds, disputes, and real payouts
- Final marketplace-agent/seller-of-record, GST, invoice, cancellation, substitution, refund, and retention decisions
- OneMap geocoding and private server-side distance bands
- Supabase Storage or equivalent for product images, message attachments, and fulfilment evidence
- Transactional outbox, email, Web Push, critical seller SMS, retries, and dead-letter operations
- Structured substitution, cancellation, issue, refund, no-show, and failed-delivery workflows
- Full seller onboarding, UEN/KYC review, protected location setup, variants, add-ons, images, and policy CRUD
- Production observability, rate limits, CSP/cookie hardening, secret scanning, backups, restore drills, and incident runbooks
- Concurrency, authorization, accessibility, responsive-browser, load, and security penetration suites required by the PRD

The complete gap analysis and recommended build sequence are documented in [`docs/MVP_SCOPE_AND_ROADMAP.md`](docs/MVP_SCOPE_AND_ROADMAP.md).

## How to proceed from here

### 1. Validate operations before adding more software

Run a 3–4 week concierge pilot with 10–15 curated florists. Include home delivery-only, approved home pickup, public-store pickup, and both-mode sellers. Manually process supervised orders and record:

- actual seller response times;
- real daily and peak-date capacity;
- delivery zones, fees, windows, damage, and failed-delivery cost;
- pickup privacy and no-show behaviour;
- substitution and clarification frequency;
- buyer conversion after the delivery fee appears; and
- seller willingness to pay a 12–15% commission for incremental demand.

Do not promise a subsidised delivery network. Keep seller-managed delivery and real pickup slots until volume proves a courier opportunity.

### 2. Freeze the decisions that change the architecture

Before live payment work, get explicit answers for:

- Marketplace agent versus principal role
- Florist as seller of record and receipt/invoice responsibility
- Approved marketplace PSP and manual authorisation/capture support
- GST-inclusive price display, commission, delivery-fee, refund, and payout treatment
- Cancellation, freshness, damage, substitution, no-show, and failed-delivery terms
- Recipient-data legal basis, privacy notice, access purpose, and retention
- Home-pickup approval and compliance evidence

### 3. Build a production foundation, then deepen workflows

Use a modular monolith first. Replace the demo adapters in this order:

1. Identity, roles, MFA path, RLS, encrypted protected data, audit, CI, and environment separation
2. Invite-only seller onboarding, typed locations, PSP readiness, fulfilment, catalogue, and moderation
3. PostgreSQL/PostGIS availability engine and public search/product pages
4. Atomic 15-minute holds, single-seller cart, guest checkout, PSP authorise/capture/void, and webhook deduplication
5. Seller order operations, messaging, substitution, pickup/delivery branches, and reliable notifications
6. Issues, refunds, payout holds, reconciliation, support, admin controls, analytics, and reviews
7. Security, concurrency, accessibility, performance, backup/restore, seller training, and launch-gate hardening

The PRD estimates 18–22 weeks for a production-minded closed beta with a small cross-functional team. A single-developer build is more realistically 5–7 months and carries higher payment, privacy, and operational risk.

### 4. Use evidence-based gates

Proceed to a 60–90 day beta only after real pickup and delivery test orders, PSP reconciliation, privacy review, support runbooks, and 10–15 trained sellers. Continue investment when availability remains accurate, seller acceptance exceeds 90%, preparation is on time, delivery failures remain below roughly 3–5%, contribution margin is positive, and buyers discover sellers beyond direct seller links.

## Source decisions applied

The newer [`Singapore Florist Platform MVP PRD.md`](Singapore%20Florist%20Platform%20MVP%20PRD.md) is authoritative where it conflicts with the earlier [`Singapore Florist Platform Concept.md`](Singapore%20Florist%20Platform%20Concept.md). In particular:

- The MVP supports delivery-only, pickup-only, or both; it is not universally pickup-first.
- Home sellers default to delivery-only. Home pickup needs explicit opt-in, attestation, and platform approval.
- Seller-managed delivery uses static zones, fees, and windows; the platform does not operate a fleet.
- Checkout uses manual seller acceptance: authorise first, capture on acceptance, void on decline/timeout.
- Every cart/order belongs to one florist.
- Guest checkout is the desired production path, but secure magic-link identity is not implemented in this prototype.

The visual implementation follows the repository’s local skills with a clear hierarchy: `minimalist-ui` for the warm editorial product language, `emil-design-eng` for interaction and motion discipline, and targeted ideas from `high-end-visual-design` and `stitch-design-taste`. Conflicting mandates were resolved in favour of accessibility, restrained motion, flat warm surfaces, and repeatable dashboard usability.

## Demo content and assets

Florist names, products, buyers, recipients, orders, addresses, reviews, and financial records are fictional demonstration data. Product and hero photography uses remote Unsplash image URLs as replaceable placeholders; production sellers must provide rights-cleared images and accurate alt text.

`Petalfolk` is a working product name. Complete trademark, domain, and brand checks before public use.
