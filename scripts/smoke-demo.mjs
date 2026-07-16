import assert from "node:assert/strict";

const baseUrl = process.env.MVP_BASE_URL ?? "http://localhost:3000";

function singaporeDateFromNow(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function singaporeOrderNumberPrefix(date = new Date()) {
  const dateLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `FL-${dateLocal.slice(2).replaceAll("-", "")}-`;
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(`${init.method ?? "GET"} ${path}: ${message ?? response.status}`);
  }
  return payload;
}

const jsonHeaders = { "content-type": "application/json" };

await request("/api/v1/seller/settings", {
  method: "PATCH",
  headers: jsonHeaders,
  body: JSON.stringify({ acceptingOrders: true, acceptingNewOrders: true }),
});

const dashboard = await request("/api/v1/seller/dashboard");
assert.equal(dashboard.demoMode, true);
assert.ok(dashboard.products.length > 0, "demo seller should have products");

const sellerProduct = dashboard.products[0];
await request(`/api/v1/products/${sellerProduct.id}`, {
  method: "PATCH",
  headers: jsonHeaders,
  body: JSON.stringify({ status: "published" }),
});

async function findBookableProduct({ method, budget, postcode, sellerId }) {
  for (let days = 3; days <= 13; days += 1) {
    const date = singaporeDateFromNow(days);
    const query = new URLSearchParams({ date, method, budget: String(budget) });
    if (postcode) query.set("postcode", postcode);
    const catalog = await request(`/api/v1/catalog?${query}`);
    assert.equal(catalog.demoMode, true);
    const product = sellerId
      ? catalog.products.find((item) => item.seller.id === sellerId)
      : catalog.products[0];
    if (product) return { date, product };
  }
  throw new Error(`No ${method} product remained bookable in the seeded 13-day window.`);
}

const deliveryResult = await findBookableProduct({
  method: "delivery",
  budget: 160,
  postcode: "160042",
  sellerId: dashboard.seller.id,
});
const requestedDate = deliveryResult.date;
const product = deliveryResult.product;
assert.equal(product.availability.bookable, true);
assert.ok(!("publicAddress" in product.seller), "home seller must not expose an exact address");

const idempotencyKey = `smoke-order-${Date.now()}`;
const orderInput = {
  productId: product.id,
  requestedDate,
  fulfilmentMethod: "delivery",
  postcode: "160042",
  window: product.availability.window,
  quantity: 1,
  buyer: { name: "Jamie Lim", email: "jamie@example.com" },
  recipient: {
    name: "Alicia Tan",
    phone: "91234821",
    address: "20 Tiong Bahru Road",
  },
  giftMessage: "Thinking of you today.",
  deliveryInstructions: "Call the recipient on arrival.",
};

const created = await request("/api/v1/orders", {
  method: "POST",
  headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey },
  body: JSON.stringify(orderInput),
});
assert.equal(created.order.commercialStatus, "awaiting_seller");
assert.equal(created.order.paymentStatus, "authorised");
assert.ok(created.order.orderNumber.startsWith(singaporeOrderNumberPrefix()));

const retried = await request("/api/v1/orders", {
  method: "POST",
  headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey },
  body: JSON.stringify(orderInput),
});
assert.equal(retried.order.id, created.order.id, "checkout retry must be idempotent");

const orderId = created.order.id;
const deliverySellerQuery = new URLSearchParams({
  sellerId: created.order.seller.id,
}).toString();
const transition = async (action) =>
  request(`/api/v1/seller/orders/${orderId}?${deliverySellerQuery}`, {
    method: "PATCH",
    headers: { ...jsonHeaders, "Idempotency-Key": `smoke-${orderId}-${action}` },
    body: JSON.stringify({ action }),
  });

const accepted = await transition("accept");
assert.equal(accepted.order.commercialStatus, "confirmed");
assert.equal(accepted.order.paymentStatus, "captured");

for (const action of ["preparing", "ready", "out_for_delivery", "delivered", "fulfilled"]) {
  await transition(action);
}

const completed = await request(`/api/v1/orders/${orderId}`);
assert.equal(completed.order.commercialStatus, "completed");
assert.equal(completed.order.operationalStatus, "fulfilled");
assert.ok(completed.events.length >= 6, "material order actions should be append-only events");

const initialSellerNote = await request(`/api/v1/seller/orders/${orderId}/note`);
const sellerNoteMarker = `SMOKE_SELLER_NOTE_${Date.now()}`;
const savedSellerNote = await request(`/api/v1/seller/orders/${orderId}/note`, {
  method: "PUT",
  headers: jsonHeaders,
  body: JSON.stringify({
    body: `${sellerNoteMarker}\nCourier handoff confirmed.`,
    expectedVersion: initialSellerNote.note.version,
  }),
});
const reloadedSellerNote = await request(`/api/v1/seller/orders/${orderId}/note`);
assert.equal(reloadedSellerNote.note.body, savedSellerNote.note.body);
assert.equal(reloadedSellerNote.note.version, savedSellerNote.note.version);
const buyerSafeOrder = await request(`/api/v1/orders/${orderId}`);
assert.ok(
  !JSON.stringify(buyerSafeOrder).includes(sellerNoteMarker),
  "private seller notes must stay out of the buyer order bundle",
);
await request(`/api/v1/seller/orders/${orderId}/note`, {
  method: "PUT",
  headers: jsonHeaders,
  body: JSON.stringify({ body: "", expectedVersion: reloadedSellerNote.note.version }),
});

const message = await request(`/api/v1/orders/${orderId}/messages`, {
  method: "POST",
  headers: { ...jsonHeaders, "Idempotency-Key": `smoke-${orderId}-message` },
  body: JSON.stringify({
    senderRole: "buyer",
    senderName: "Jamie Lim",
    body: "Thank you—the tracking updates were clear.",
  }),
});
assert.equal(message.demoMode, true);

const declineResult = await findBookableProduct({
  method: "delivery",
  budget: 160,
  postcode: "160042",
  sellerId: dashboard.seller.id,
});
const declineInput = {
  ...orderInput,
  productId: declineResult.product.id,
  requestedDate: declineResult.date,
  window: declineResult.product.availability.window,
  buyer: { name: "Morgan Lee", email: "morgan@example.com" },
};
const declineCreated = await request("/api/v1/orders", {
  method: "POST",
  headers: {
    ...jsonHeaders,
    "Idempotency-Key": `smoke-decline-order-${Date.now()}`,
  },
  body: JSON.stringify(declineInput),
});
assert.ok(declineCreated.order.orderNumber.startsWith(singaporeOrderNumberPrefix()));
const declineSellerQuery = new URLSearchParams({
  sellerId: declineCreated.order.seller.id,
}).toString();
const declined = await request(`/api/v1/seller/orders/${declineCreated.order.id}?${declineSellerQuery}`, {
  method: "PATCH",
  headers: {
    ...jsonHeaders,
    "Idempotency-Key": `smoke-${declineCreated.order.id}-decline`,
  },
  body: JSON.stringify({
    action: "decline",
    reason: "Demo decline path: a required flower was unavailable.",
  }),
});
assert.equal(declined.order.commercialStatus, "declined");
assert.equal(declined.order.paymentStatus, "voided");

const pickupResult = await findBookableProduct({ method: "pickup", budget: 180 });
assert.equal(pickupResult.product.availability.bookable, true);
assert.ok(
  pickupResult.product.seller.publicAddress,
  "pickup seller should expose only its approved public collection location",
);

const pickupCreated = await request("/api/v1/orders", {
  method: "POST",
  headers: {
    ...jsonHeaders,
    "Idempotency-Key": `smoke-pickup-order-${Date.now()}`,
  },
  body: JSON.stringify({
    productId: pickupResult.product.id,
    requestedDate: pickupResult.date,
    fulfilmentMethod: "pickup",
    window: pickupResult.product.availability.window,
    quantity: 1,
    buyer: { name: "Jamie Lim", email: "jamie@example.com" },
    recipient: { name: "Jamie Lim", phone: "91234821" },
  }),
});
const pickupSellerId = pickupResult.product.seller.id;
assert.notEqual(
  pickupSellerId,
  dashboard.seller.id,
  "pickup fixture should exercise a different seller workspace",
);
assert.ok(pickupCreated.order.orderNumber.startsWith(singaporeOrderNumberPrefix()));
assert.equal(pickupCreated.order.pickupLocation, pickupResult.product.seller.publicAddress);

const pickupSellerQuery = new URLSearchParams({ sellerId: pickupSellerId }).toString();
const pickupSellerDashboard = await request(`/api/v1/seller/dashboard?${pickupSellerQuery}`);
assert.equal(pickupSellerDashboard.seller.id, pickupSellerId);
const queuedPickup = pickupSellerDashboard.orders.find(
  (item) => item.id === pickupCreated.order.id,
);
assert.ok(queuedPickup, "pickup order must appear in its fulfilling seller dashboard");
assert.equal(queuedPickup.operationalStatus, "awaiting_acceptance");
const unrelatedSellerQuery = new URLSearchParams({ sellerId: dashboard.seller.id }).toString();
const unrelatedSellerDashboard = await request(
  `/api/v1/seller/dashboard?${unrelatedSellerQuery}`,
);
assert.ok(
  !unrelatedSellerDashboard.orders.some((item) => item.id === pickupCreated.order.id),
  "pickup order must not appear in an unrelated seller dashboard",
);

const pickupTransition = async (action) =>
  request(`/api/v1/seller/orders/${pickupCreated.order.id}?${pickupSellerQuery}`, {
    method: "PATCH",
    headers: {
      ...jsonHeaders,
      "Idempotency-Key": `smoke-${pickupCreated.order.id}-${action}`,
    },
    body: JSON.stringify({ action }),
  });

for (const action of ["accept", "preparing", "ready", "fulfilled"]) {
  await pickupTransition(action);
  const sellerSnapshot = await request(`/api/v1/seller/dashboard?${pickupSellerQuery}`);
  const visibleOrder = sellerSnapshot.orders.find((item) => item.id === pickupCreated.order.id);
  assert.ok(visibleOrder, `pickup order must remain visible after ${action}`);
  assert.equal(visibleOrder.operationalStatus, action === "accept" ? "accepted" : action);
}
const pickupCompleted = await request(`/api/v1/orders/${pickupCreated.order.id}`);
assert.equal(pickupCompleted.order.fulfilmentMethod, "pickup");
assert.equal(pickupCompleted.order.operationalStatus, "fulfilled");
assert.equal(pickupCompleted.order.pickupLocation, pickupResult.product.seller.publicAddress);

console.log(
  JSON.stringify(
    {
      result: "ok",
      orderNumber: completed.order.orderNumber,
      pickupOrderNumber: pickupCompleted.order.orderNumber,
      declinedOrderNumber: declined.order.orderNumber,
      finalStatus: completed.order.commercialStatus,
      eventCount: completed.events.length,
      pathwayChecks: "delivery and pickup fulfilled; decline voided",
      privacyCheck: "home address absent; approved pickup location present",
      pickupSellerId,
      pickupSellerWorkspace: `/seller?sellerId=${encodeURIComponent(pickupSellerId)}&orderId=${encodeURIComponent(pickupCreated.order.id)}`,
    },
    null,
    2,
  ),
);
