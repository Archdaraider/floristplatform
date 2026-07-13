# MVP Scope and Roadmap

**Status:** Product/system prototype; safe for demos and synthetic test data only  
**Updated:** 13 July 2026  
**Product source of truth:** [Singapore Florist Platform MVP PRD](../Singapore%20Florist%20Platform%20MVP%20PRD.md). The [Concept](../Singapore%20Florist%20Platform%20Concept.md) supplies research context; where the documents differ, the PRD wins.

## Executive recommendation

The current v1 is good enough to demonstrate the marketplace promise, test workflows with florists, and run sandbox order rehearsals. It is **not ready for real customers, personal data, or payments**.

Use it now as a clickable concierge tool while validating supply, fulfilment, fees, and operating language. In parallel, freeze the legal/payment model and decide the production platform. Then complete the PRD P0 work behind authentication, tenant isolation, audited protected-data access, and a licensed marketplace PSP before admitting a closed-beta buyer.

One important precedence decision: the Concept suggests a pickup-first launch, but the PRD supports seller-configured delivery-only, pickup-only, or both. Do not hard-code pickup-first. Recruit and test all important fulfilment patterns, then let evidence determine launch merchandising.

## 1. What v1 proves today

| Path | Current proof |
|---|---|
| Buyer — `/` | Mobile-first discovery by date, pickup/delivery, postcode, occasion, style, and budget; bookable seeded results; one submitted plan shared by results/basket/checkout; separate buyer/recipient inputs; transparent demo total; simulated order request. |
| Buyer tracking — `/order/:id` | Seller-confirmation state, next action, monotonic courier timeline, retry-safe labelled messaging, resilient background refresh, and fee summary. |
| Seller — `/seller` | Deadline-led action queue, race-safe selection/actions, fulfilment destination/instructions/conversation, new-order pause/resume, product pause/restore, capacity view, and simulated payout summary. |
| Operations — `/admin` | Read-only marketplace metrics, seller-review context, a derived exception queue, and recent append-only order events. Approval and information-request actions are intentionally placeholders. |

The implementation also proves several useful domain choices:

- One availability calculation is reused by catalogue, product detail, and order submission for the seeded model. It checks seller verification/payment readiness, product state, lead time, method, date, capacity, one deterministic delivery zone, fee, and budget.
- Order creation conditionally reserves capacity in a database batch. Order retries reject changed payloads, while transition and message keys are scoped to the requested order and also reject changed commands.
- Orders snapshot product, policy, fee, GST flag, commission, and seller-net values instead of reading mutable listing data later.
- Commercial, operational, payment, and payout states are separate. Acceptance simulates capture; decline or lazy timeout reconciliation simulates void and releases reserved capacity exactly once.
- Pickup and delivery use different allowed transitions, deadlines render in the Singapore market context, and public seller projections omit exact addresses for seeded home sellers.
- The responsive Next.js/React PWA shell, versioned API shape, synthetic D1 data, render tests, and smoke script are a practical base for research and engineering discussion.

What v1 does **not** prove: authenticated multi-tenancy, secure guest order access, a real 15-minute checkout hold and expiry process, real payment movement, encrypted protected data, production concurrency, notification delivery, refunds/payout reconciliation, seller onboarding, or staffed support operations.

## 2. PRD P0 readiness

“Represented” below means the workflow or rule can be demonstrated. It does not mean the P0 requirement has passed its PRD acceptance test.

| P0 area | Represented in v1 | Required before closed beta |
|---|---|---|
| Core marketplace — FR-C01–C07 | Both fulfilment methods, shared eligibility logic, conditional capacity reservation, one-product/one-seller orders, immutable snapshots, Singapore timezone, scoped idempotency on key writes, and idempotent lazy acceptance-expiry reconciliation. | Add a real cart and atomic 15-minute checkout hold; retain capacity through `accept_by`; add scheduled expiry/recovery workers; make **every** command idempotent; prove race behaviour, transaction boundaries, and notification/payment side effects under load. |
| Location and fulfilment — FR-L01–L06 | Broad public areas, public store address support, home-address omission in public seller projections, postal-sector zones/fees, and capacity-aware pickup/delivery results. | Model registered, production, pickup, public-store, and search-area addresses separately; encrypt private values; add OneMap/server-side distance and real pickup windows; release private pickup instructions only to an authorised confirmed buyer; audit every protected view; run payload/log/map leakage tests. |
| Buyer — FR-B01–B08, B11 | Most discovery inputs, product/policy context, separate checkout fields, simulated authorise/capture/void, understandable tracking, and labelled order chat. | Complete flower/time-window filters and cart revalidation; add verified email plus scoped magic-link/session access; enforce buyer/seller/support identities server-side; build structured substitutions, cancellation, issue/evidence, timeout, and notification workflows. Current order read/write and messaging routes are unauthenticated and must not hold real data. |
| Seller — FR-S01–S10 | Action queue, pause behaviour, product pause/restore, acceptance deadline/expiry handling, pickup/delivery branches, authorised fulfilment details and chat, capacity display, and illustrative payout math. | Build invite/onboarding/UEN/PSP verification and admin activation; fulfilment/privacy/zone/window/lead-time/capacity/blackout settings; full catalogue CRUD with archive; structured substitution; scheduled timeout workers; authenticated seller ownership; provider-backed capture and payout reconciliation. |
| Admin/support/finance — FR-A01–A07 | Read-only seller review data, two derived exception types, order events, and visibly labelled support concepts. | Add role/MFA enforcement; review/moderation commands with actor/reason/audit event; complete exception ownership; unified payment/refund/payout/protected-access timeline; support case tools; full/partial refunds and payout holds; cross-tenant and privileged-access tests. |
| Privacy/compliance — FR-P01, P02, P06, P07, P09, P10 | Buyer/recipient are separate UI concepts; gift message and delivery instructions use separate fields; order snapshot includes a GST flag and transparent totals. | Store buyer and recipient as separate protected entities; encrypt and purpose-limit fulfilment data; implement retention/deletion/export controls, protected-access reasons, immutable audit, incident/DPO workflow, breach deadlines, and final approved notices. A field split alone is not a privacy boundary. |
| Payments — FR-P03–P05 | PSP readiness, authorisation, capture, void, commission, and payout are only modelled as demo fields/states. | Use a licensed marketplace PSP with connected seller verification; signed and deduplicated webhooks; provider idempotency; capture/void/refund/dispute/payout flows; immutable ledger and 100% reconciliation. Never route buyer funds through the platform’s ordinary bank account. Keep PayNow disabled until an approved compatible flow exists. |

Bottom line: most of the buyer/seller narrative is represented, but no P0 group is production-complete. The largest release blockers are identity/permissions, protected data, PSP/ledger integration, seller onboarding, timeout/background work, and support/refund operations.

## 3. Decisions to close before live payments

Record each decision with an owner, approver, evidence, and date. Do not begin real payment implementation while any item that changes the seller-of-record or money-flow architecture is unresolved.

1. **Marketplace role and contracts:** agent versus principal wording; florist as seller of record; invoice/receipt responsibility; cancellation, substitution, freshness, damage, no-show, failed-delivery, dispute, and platform refund authority.
2. **PSP design:** approved Singapore marketplace provider; connected-account/KYC model; card/wallet authorisation duration; accept/capture and decline/void sequence; refunds, disputes, payout timing/holds, webhook contract, and platform fee collection. No off-platform PayNow collection.
3. **Tax and accounting:** seller GST status/effective dates, GST-inclusive display, delivery and commission treatment, tax-document rules, credit notes, ledger ownership, and reconciliation procedure.
4. **Privacy and security:** recipient-data authority/notice, private-home address release rules, encryption/key ownership, seller/support access purpose, retention schedule, subprocessors, DPO and three-calendar-day breach-assessment process.
5. **Fulfilment operations:** seller-managed delivery responsibility, approved pickup patterns for home sellers, proof/no-show/failure standards, support hours, escalation owners, and remedy allocation.
6. **Production architecture:** the prototype uses vinext/Cloudflare Worker/D1, while the PRD specifies Next.js/Vercel plus Supabase PostgreSQL/PostGIS/Auth/RLS. Migrate to the PRD stack before expanding the schema, or approve a documented PRD amendment only after proving equivalent transactions, tenant isolation, geospatial support, Singapore-region/privacy posture, backup/PITR, and operational tooling. Do not maintain two production paths.

Required advisers: Singapore marketplace/consumer counsel, tax/accounting adviser, DPO/privacy adviser, chosen PSP solutions engineer, and a senior engineer responsible for payment and tenancy design.

## 4. Recommended 0–90 day concierge validation

Until the legal and PSP gates pass, use synthetic data, PSP sandbox flows, and no-money rehearsals. Any real order must operate only under a counsel- and PSP-approved mode; never collect real payment credentials in this prototype.

| Period | Work | Evidence to retain |
|---|---|---|
| Days 0–14 — learn and recruit | Interview 20–30 florists and mystery-shop 50 sellers. Recruit 10–15 willing beta florists across home delivery-only, approved home pickup, public-store pickup, and both-mode configurations; aim for three per important pattern where feasible. Capture actual zones, fees, windows, lead times, capacity, pause behaviour, couriers, damage terms, and commission willingness. | Interview notes; fulfilment/configuration matrix; courier quotes; objection log; recruited cohort; decision log for every assumption affecting payments or seller of record. |
| Days 15–30 — configure and rehearse | Concierge-create profiles/catalogues with sellers. Run at least one pickup and one seller-managed delivery dry run per relevant seller. Rehearse search → request → accept/decline → prepare → fulfil → issue/refund paths in the prototype and PSP sandbox. Test whether the proposed 60-minute acceptance SLA and 15-minute checkout hold match real operations. | Catalogue completeness; dry-run timing; false-availability reasons; support handoffs; policy-language feedback; PSP sandbox evidence; seller training gaps. |
| Days 31–60 — supervised pilot | If hard gates are not passed, continue sandbox/no-money tests. If passed, admit a small invitation-only buyer cohort during staffed hours, cap daily orders, manually monitor every deadline, and use sellers’ existing delivery arrangements. Do not subsidise delivery. | Per-order operations log: acquisition source, search context, zero result, displayed/actual fee, acceptance time/result, preparation/delivery outcome, substitution, refund, support minutes, GMV and contribution margin. |
| Days 61–90 — controlled expansion or pause | Increase volume only when availability, reconciliation, privacy, and fulfilment remain inside target. Review weekly by seller, method, area, date, and acquisition source. At day 90 choose continue, change proposition, or stop/pause investment. | 100-order/seasonal-traction view; cohort seller interviews; buyer discovery/repeat evidence; unit economics; incident/refund analysis; written go/no-go decision. |

Keep concierge operations deliberately visible. A manual intervention is acceptable; an unowned timeout, unrecorded refund, or hidden availability failure is not.

## 5. Engineering roadmap to closed beta

Reuse the current UI and domain prototype as a learning reference, not as evidence that production foundations are complete. Retain the PRD planning envelope of approximately **18–22 weeks with the recommended small team** (some validation runs in parallel); expect roughly **5–7 months for one developer** with materially higher security and operations risk.

| Phase | Outcome and exit evidence |
|---|---|
| Phase 0 — concierge validation, 3–4 weeks | Cohort recruited; fulfilment and fee assumptions tested; draft terms agreed; PSP confirms the proposed model; no unresolved seller-of-record/payment architecture issue. |
| Sprint 0 — foundation, 2 weeks | Production stack/contract frozen; isolated environments; migrations/CI; authentication, roles and MFA path; tenant policies/RLS; audit and outbox patterns; PSP webhook skeleton; cross-tenant tests pass. |
| Sprints 1–2 — seller supply, 4 weeks | Invite onboarding, UEN/PSP status, typed private locations and approval; full catalogue/configuration/capacity CRUD; all three seller fulfilment configurations work; no protected location leaks. |
| Sprint 3 — availability and discovery, 2 weeks | Canonical eligibility service, postal/location adapter, real pickup slots, search/product/cart consistency, zero-result recovery, privacy payload tests, and mobile performance target. |
| Sprint 4 — cart, holds, checkout and payments, 2 weeks | Single-seller cart; atomic checkout hold and pending-acceptance reservation; verified guest access; policy/tax snapshots; provider authorise/capture/void; webhook dedupe; concurrency and money-state invariants pass. Start only after Section 3 decisions are signed off. |
| Sprints 5–7 — operations, 6 weeks | Seller fulfilment and substitutions; secure messages/notifications; cases/evidence; refunds, payout holds and ledger; complete admin queues/timeline; analytics, reviews, privacy workflows, and reconciliation. |
| Sprint 8 plus stabilisation — 4–6 weeks | Critical end-to-end, concurrency, security, accessibility and performance suites pass; backup/restore and dead-letter drills complete; policies/runbooks staffed; 10 representative sellers complete test orders; no release blocker remains. |

Do not shorten the critical path by deferring auth/RLS, payment reconciliation, protected-address controls, or support/refund tools. Those are the closed-beta product, not polish.

## 6. Go/no-go scorecard

### Hard no-go conditions

Do not launch or expand if any of these is true:

- Marketplace/legal/PSP/tax decisions are unsigned, or the PSP has not tested onboarding, authorise, capture, void, refund, dispute, and payout flows.
- An unauthenticated or cross-tenant user can read/mutate an order, message, seller setting, payment state, or protected location.
- Capacity races can double-book; a confirmed order can exist without captured payment; provider and ledger data do not reconcile 100%.
- A private home address, recipient detail, payment secret, or message can leak through API payloads, HTML, logs, analytics, maps, exports, or media metadata.
- Refund, incident, support, and seller-managed-delivery runbooks are unapproved or unstaffed.
- Fewer than 10 trained sellers are ready, the fulfilment mix is unrepresentative, or fewer than 80% of active sellers have genuinely bookable launch inventory.

### 60–90 day operating targets

| Metric | Go signal |
|---|---:|
| Availability accuracy | At least 95% remain valid through checkout, excluding genuine race revalidation |
| Seller acceptance | At least 90%; median no more than 30 minutes during response hours |
| On-time preparation/readiness | At least 95% |
| Delivery failure | Below 3–5% in limited seller-managed tests |
| Payment/refund reconciliation | 100% |
| Critical privacy/security incidents | 0 |
| Demand | 100+ orders in 60–90 days, or documented seasonal traction |
| Economics | Positive contribution margin before fixed team/product cost; no routine delivery subsidy |

Also require evidence that buyers discover sellers through marketplace browse/search rather than only seller links, and that sellers regard the orders as incremental and remain willing to pay the tested commission. Recommended experiment thresholds are at least 25% marketplace-discovery-sourced orders by day 90 and at least 70% of active cohort sellers willing to continue at the tested fee; treat these as hypotheses to confirm, not PRD mandates.

**Go:** hard gates pass, numerical targets are met or trending credibly with an explained seasonal sample, and seller/buyer value is demonstrated.  
**Change:** zero results, delivery price, response time, or a fulfilment pattern breaks the buyer promise; narrow dates/areas/sellers or revise the proposition before adding scope.  
**Stop/pause:** privacy or money integrity is not controllable, contribution remains negative without subsidy, or curated supply does not produce incremental discovery after focused iteration.

## 7. Founder next actions

### Next 7 days

1. Label every environment and screen as demo/sandbox; prohibit real payment details and production personal data.
2. Appoint named owners for product/operations, engineering/security, support, finance/reconciliation, risk, and DPO escalation.
3. Book the legal/tax/privacy and PSP design sessions; create a dated decision log for the six decisions in Section 3.
4. Decide whether to migrate to the PRD production stack or formally amend the PRD; do this before additional persistence work.
5. Start the 20–30 seller interviews and recruit the 10–15 seller cohort using the fulfilment/configuration matrix.

### Next 30 days

1. Complete 50-seller mystery shopping, courier/fee research, seller catalogue setup, and dry-run orders.
2. Draft and review seller, buyer, privacy, cancellation, substitution, refund, damage, no-show, failed-delivery, and incident policies.
3. Turn every PRD P0 requirement and mandatory edge case into an owned backlog item with acceptance evidence; do not mark a screen mock as complete implementation.
4. Confirm the small-team plan and budget. At minimum, retain senior review for identity/tenancy, payment architecture, protected data, and order concurrency.
5. Build a single per-order concierge scorecard now so the first test produces comparable demand, supply, operations, economics, and security evidence.

The immediate business goal is not “more features.” It is proving that accurate availability plus dependable seller fulfilment creates incremental orders at a positive contribution margin, without exposing private data or taking unlicensed custody of buyer funds.
