import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const vinextCli = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const hostname = "127.0.0.1";

let baseUrl;
let devServer;
let devServerExit;
let serverOutput = "";

function rememberServerOutput(chunk) {
  serverOutput = `${serverOutput}${chunk}`.slice(-64_000);
}

async function findAvailablePort() {
  const preferredPort = Number(process.env.PETALFOLK_TEST_PORT ?? 43_127);

  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = createServer();
      probe.unref();
      probe.once("error", () => resolve(false));
      probe.listen({ host: hostname, port }, () => {
        probe.close(() => resolve(true));
      });
    });

    if (available) return port;
  }

  throw new Error(`Could not find a free test port from ${preferredPort}.`);
}

function signalDevServer(signal) {
  if (!devServer?.pid || devServer.exitCode !== null || devServer.signalCode) {
    return;
  }

  if (process.platform === "win32") {
    devServer.kill(signal);
    return;
  }

  try {
    process.kill(-devServer.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function stopDevServer() {
  if (!devServer || devServer.exitCode !== null || devServer.signalCode) return;

  signalDevServer("SIGTERM");
  const stopped = await Promise.race([
    devServerExit.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);

  if (!stopped) {
    signalDevServer("SIGKILL");
    await devServerExit;
  }
}

before(async () => {
  const port = await findAvailablePort();
  baseUrl = `http://${hostname}:${port}`;
  devServer = spawn(
    process.execPath,
    [vinextCli, "dev", "--hostname", hostname, "--port", String(port)],
    {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: ".wrangler/test-wrangler.log",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  devServer.stdout.on("data", rememberServerOutput);
  devServer.stderr.on("data", rememberServerOutput);
  devServerExit = new Promise((resolve) => devServer.once("exit", resolve));

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (devServer.exitCode !== null || devServer.signalCode) {
      throw new Error(`Vinext exited before becoming ready:\n${serverOutput}`);
    }

    try {
      const response = await fetch(baseUrl, {
        headers: { accept: "text/html" },
        signal: AbortSignal.timeout(2_000),
      });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // Vinext and the local Cloudflare worker are still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Vinext at ${baseUrl}:\n${serverOutput}`);
}, { timeout: 50_000 });

after(async () => {
  await stopDevServer();
});

async function render(pathname = "/") {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { accept: "text/html" },
  });
}

async function jsonRequest(pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = await response.json();
  return { response, body };
}

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

async function findBookableDelivery() {
  for (let days = 3; days <= 13; days += 1) {
    const date = singaporeDateFromNow(days);
    const query = new URLSearchParams({
      date,
      method: "delivery",
      postcode: "160042",
      budget: "200",
    });
    const { response, body } = await jsonRequest(`/api/v1/catalog?${query}`);
    assert.equal(response.status, 200);
    if (body.products?.[0]) return { date, product: body.products[0] };
  }
  throw new Error("No bookable delivery product found for API validation tests.");
}

async function findBookablePickup() {
  for (let days = 3; days <= 13; days += 1) {
    const date = singaporeDateFromNow(days);
    const query = new URLSearchParams({
      date,
      method: "pickup",
      budget: "200",
    });
    const { response, body } = await jsonRequest(`/api/v1/catalog?${query}`);
    assert.equal(response.status, 200);
    if (body.products?.[0]) return { date, product: body.products[0] };
  }
  throw new Error("No bookable pickup product found for seller-scope tests.");
}

test("server-renders the consumer marketplace", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Independent Singapore florists — Petalfolk/);
  assert.match(html, /Flowers that/);
  assert.match(html, /Finding matches/);
  assert.match(html, /Availability rechecked/);
  assert.match(html, /Consumer/);
  assert.match(html, /Seller/);
  assert.match(html, /Operations/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the seller action queue", async () => {
  const response = await render("/seller");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Seller studio/);
  assert.match(html, /Action queue/);
  assert.match(html, /Orders by next deadline/);
  assert.match(html, /Checking intake/);
  assert.match(html, /Unread messages/);
});

test("server-renders the operations console", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Marketplace operations/);
  assert.match(html, /Seller review/);
  assert.match(html, /Exception queue/);
  assert.match(html, /Append-only record/);
  assert.match(html, /Privacy guard represented/);
});

test("rejects malformed mutation payloads with field-level validation", async () => {
  const { response, body } = await jsonRequest("/api/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": "test:wrong-types" },
    body: JSON.stringify({
      productId: "product-blush-garden",
      requestedDate: singaporeDateFromNow(4),
      fulfilmentMethod: "delivery",
      postcode: "160042",
      buyer: { name: 42, email: "jamie@example.com" },
      recipient: { name: "Alicia", phone: "91234821", address: "20 Tiong Bahru Road" },
    }),
  });

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "VALIDATION_FAILED");
  assert.match(body.error.fieldErrors["buyer.name"], /text|required/i);

  const settings = await jsonRequest("/api/v1/seller/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ acceptingNewOrders: false, pausedUntil: "not-a-date" }),
  });
  assert.equal(settings.response.status, 422);
  assert.equal(settings.body.error.code, "INVALID_SETTINGS");
  assert.match(settings.body.error.fieldErrors.pausedUntil, /ISO date-time/i);
});

test("understands typo-heavy flower searches without bypassing availability", async () => {
  const query = "Roses + daiseis fr anniversary black wrapper";
  let exact;

  for (let days = 3; days <= 13; days += 1) {
    const search = new URLSearchParams({
      date: singaporeDateFromNow(days),
      method: "delivery",
      postcode: "160042",
      budget: "200",
      q: query,
    });
    const result = await jsonRequest(`/api/v1/catalog?${search}`);
    assert.equal(result.response.status, 200);
    if (result.body.products.some((product) => product.id === "product-noir-rose-daisy")) {
      exact = result;
      break;
    }
  }

  assert.ok(exact, "the demo catalogue should include an available exact smart-search fixture");
  assert.equal(exact.body.search.exact, true);
  assert.deepEqual(exact.body.search.labels, ["rose", "daisy", "anniversary", "black wrap"]);
  assert.match(exact.body.search.correctedQuery, /rose.*daisy.*anniversary.*black wrap/i);
  assert.ok(["local", "workers-ai", "groq"].includes(exact.body.search.engine));

  const constrained = new URLSearchParams({
    date: exact.body.context.requestedDate,
    method: "delivery",
    postcode: "160042",
    budget: "100",
    q: query,
  });
  const overBudget = await jsonRequest(`/api/v1/catalog?${constrained}`);
  assert.equal(overBudget.response.status, 200);
  assert.ok(!overBudget.body.products.some((product) => product.id === "product-noir-rose-daisy"));
  assert.equal(overBudget.body.search.exact, false);

  const tooLong = new URLSearchParams({
    date: exact.body.context.requestedDate,
    method: "pickup",
    budget: "200",
    q: "x".repeat(181),
  });
  const rejected = await jsonRequest(`/api/v1/catalog?${tooLong}`);
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.body.error.code, "SEARCH_QUERY_TOO_LONG");
  assert.match(rejected.body.error.fieldErrors.q, /180/);
});

test("scopes pickup orders, notes, and buyer-message reads to the fulfilling seller", async () => {
  const { date, product } = await findBookablePickup();
  const sellerId = product.seller.id;
  const wrongSellerId = "seller-petal-poem";
  assert.notEqual(sellerId, wrongSellerId, "the pickup fixture must use a pickup-enabled seller");
  assert.ok(product.seller.publicAddress, "pickup catalog results must project an approved location");

  const beforeCreate = new Date();
  const created = await jsonRequest("/api/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `test:pickup-seller-scope:${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      productId: product.id,
      requestedDate: date,
      fulfilmentMethod: "pickup",
      window: product.availability.window,
      quantity: 1,
      buyer: { name: "Pickup Scope Test", email: "pickup-scope@example.com" },
      recipient: { name: "Pickup Recipient", phone: "91234821" },
    }),
  });
  const afterCreate = new Date();
  assert.equal(created.response.status, 201);
  const order = created.body.order;
  const orderId = order.id;
  assert.equal(order.seller.id, sellerId);
  assert.equal(order.fulfilmentMethod, "pickup");
  assert.equal(order.pickupLocation, product.seller.publicAddress);
  assert.equal(order.totals.deliveryCents, 0);
  assert.ok(
    [singaporeOrderNumberPrefix(beforeCreate), singaporeOrderNumberPrefix(afterCreate)]
      .some((prefix) => order.orderNumber.startsWith(prefix)),
    `order number ${order.orderNumber} must use the Singapore local creation date`,
  );

  const sellerQuery = new URLSearchParams({ sellerId }).toString();
  const wrongSellerQuery = new URLSearchParams({ sellerId: wrongSellerId }).toString();
  const [ownDashboard, wrongDashboard, orderDetail] = await Promise.all([
    jsonRequest(`/api/v1/seller/dashboard?${sellerQuery}`),
    jsonRequest(`/api/v1/seller/dashboard?${wrongSellerQuery}`),
    jsonRequest(`/api/v1/orders/${orderId}`),
  ]);
  assert.equal(ownDashboard.response.status, 200);
  assert.equal(ownDashboard.body.seller.id, sellerId);
  assert.ok(ownDashboard.body.orders.some((item) => item.id === orderId));
  assert.ok(!wrongDashboard.body.orders.some((item) => item.id === orderId));
  assert.equal(orderDetail.response.status, 200);
  assert.equal(orderDetail.body.order.pickupLocation, product.seller.publicAddress);

  const ownSellerOrder = await jsonRequest(
    `/api/v1/seller/orders/${orderId}?${sellerQuery}`,
  );
  assert.equal(ownSellerOrder.response.status, 200);
  assert.equal(ownSellerOrder.body.order.id, orderId);
  assert.equal(ownSellerOrder.body.order.pickupLocation, product.seller.publicAddress);

  const wrongSellerOrder = await jsonRequest(
    `/api/v1/seller/orders/${orderId}?${wrongSellerQuery}`,
  );
  assert.equal(wrongSellerOrder.response.status, 404);
  assert.equal(wrongSellerOrder.body.error.code, "ORDER_NOT_FOUND");

  const wrongSellerTransition = await jsonRequest(
    `/api/v1/seller/orders/${orderId}?${wrongSellerQuery}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `test:cross-seller-transition:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ action: "accept" }),
    },
  );
  assert.equal(wrongSellerTransition.response.status, 404);
  assert.equal(wrongSellerTransition.body.error.code, "ORDER_NOT_FOUND");

  const ownNote = await jsonRequest(`/api/v1/seller/orders/${orderId}/note?${sellerQuery}`);
  assert.equal(ownNote.response.status, 200);
  assert.equal(ownNote.body.note.orderId, orderId);
  const wrongNoteRead = await jsonRequest(
    `/api/v1/seller/orders/${orderId}/note?${wrongSellerQuery}`,
  );
  assert.equal(wrongNoteRead.response.status, 404);
  assert.equal(wrongNoteRead.body.error.code, "ORDER_NOT_FOUND");
  const wrongNoteWrite = await jsonRequest(
    `/api/v1/seller/orders/${orderId}/note?${wrongSellerQuery}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Cross-seller overwrite", expectedVersion: 0 }),
    },
  );
  assert.equal(wrongNoteWrite.response.status, 404);
  assert.equal(wrongNoteWrite.body.error.code, "ORDER_NOT_FOUND");

  const unreadBefore = ownDashboard.body.metrics.unreadMessages;
  const targetBefore = ownDashboard.body.orders.find((item) => item.id === orderId);
  assert.equal(targetBefore.unreadBuyerMessages, 0);
  const buyerMessage = await jsonRequest(`/api/v1/orders/${orderId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `test:pickup-buyer-message:${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      senderRole: "buyer",
      senderName: "Pickup Scope Test",
      body: "I will arrive during the pickup window.",
    }),
  });
  assert.equal(buyerMessage.response.status, 201);

  const unreadDashboard = await jsonRequest(`/api/v1/seller/dashboard?${sellerQuery}`);
  const unreadOrder = unreadDashboard.body.orders.find((item) => item.id === orderId);
  assert.equal(unreadOrder.unreadBuyerMessages, 1);
  assert.equal(unreadDashboard.body.metrics.unreadMessages, unreadBefore + 1);

  const wrongRead = await jsonRequest(
    `/api/v1/seller/orders/${orderId}/messages/read?${wrongSellerQuery}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ throughMessageId: buyerMessage.body.message.id }),
    },
  );
  assert.equal(wrongRead.response.status, 404);
  assert.equal(wrongRead.body.error.code, "ORDER_NOT_FOUND");
  const stillUnread = await jsonRequest(`/api/v1/seller/dashboard?${sellerQuery}`);
  assert.equal(
    stillUnread.body.orders.find((item) => item.id === orderId).unreadBuyerMessages,
    1,
  );

  const read = await jsonRequest(
    `/api/v1/seller/orders/${orderId}/messages/read?${sellerQuery}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ throughMessageId: buyerMessage.body.message.id }),
    },
  );
  assert.equal(read.response.status, 200);
  assert.equal(read.body.orderId, orderId);
  assert.equal(read.body.markedCount, 1);

  const [readDashboard, readDetail] = await Promise.all([
    jsonRequest(`/api/v1/seller/dashboard?${sellerQuery}`),
    jsonRequest(`/api/v1/orders/${orderId}`),
  ]);
  assert.equal(readDashboard.body.metrics.unreadMessages, unreadBefore);
  assert.equal(
    readDashboard.body.orders.find((item) => item.id === orderId).unreadBuyerMessages,
    0,
  );
  const storedBuyerMessage = readDetail.body.messages.find(
    (item) => item.id === buyerMessage.body.message.id,
  );
  assert.ok(storedBuyerMessage.readAt, "the read receipt must project on the stored message");

  const cleanup = await jsonRequest(`/api/v1/seller/orders/${orderId}?${sellerQuery}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `test:pickup-seller-scope-cleanup:${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      action: "decline",
      reason: "Regression fixture cleanup releases the pickup reservation.",
    }),
  });
  assert.equal(cleanup.response.status, 200);
  assert.equal(cleanup.body.order.operationalStatus, "declined");
});

test("scopes message idempotency to the requested order and payload", async () => {
  const headers = {
    "content-type": "application/json",
    "Idempotency-Key": `test:buyer-message:${crypto.randomUUID()}`,
  };
  const input = {
    senderRole: "support",
    senderName: "Spoofed support",
    body: "Cross-order replay protection stays scoped to this order.",
  };
  const first = await jsonRequest("/api/v1/orders/order-demo-ready/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.message.orderId, "order-demo-ready");
  assert.equal(first.body.message.senderRole, "buyer");
  assert.equal(first.body.message.senderName, "Mei Lin");

  const mismatch = await jsonRequest("/api/v1/orders/order-demo-ready/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, body: "A different command payload." }),
  });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.error.code, "IDEMPOTENCY_CONFLICT");
});

test("persists versioned seller notes without exposing them to buyer order payloads", async () => {
  const orderId = "order-demo-ready";
  const initial = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`);
  assert.equal(initial.response.status, 200);
  assert.match(initial.response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(initial.response.headers.get("cache-control") ?? "", /private/);

  const initialVersion = initial.body.note.version;
  const secretMarker = `SELLER_ONLY_${crypto.randomUUID()}`;
  const body = `  ${secretMarker}\r\nCourier: use the side entrance.  `;
  const saved = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, expectedVersion: initialVersion }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.note.body, `${secretMarker}\nCourier: use the side entrance.`);
  assert.equal(saved.body.note.version, initialVersion + 1);

  const reloaded = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`);
  assert.equal(reloaded.response.status, 200);
  assert.equal(reloaded.body.note.body, saved.body.note.body);
  assert.equal(reloaded.body.note.version, saved.body.note.version);

  const replay = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, expectedVersion: initialVersion }),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.note.version, saved.body.note.version);

  const stale = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "Overwrite from a stale tab", expectedVersion: initialVersion }),
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error.code, "SELLER_NOTE_VERSION_CONFLICT");
  assert.match(stale.response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(stale.response.headers.get("cache-control") ?? "", /private/);

  const [buyerOrder, sellerDashboard] = await Promise.all([
    jsonRequest(`/api/v1/orders/${orderId}`),
    jsonRequest("/api/v1/seller/dashboard"),
  ]);
  assert.equal(buyerOrder.response.status, 200);
  assert.equal(sellerDashboard.response.status, 200);
  assert.ok(!("sellerNote" in buyerOrder.body.order));
  assert.ok(!("note" in buyerOrder.body.order));
  assert.doesNotMatch(JSON.stringify(buyerOrder.body), new RegExp(secretMarker));
  assert.doesNotMatch(JSON.stringify(sellerDashboard.body), new RegExp(secretMarker));

  const wrongType = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: 42, expectedVersion: saved.body.note.version }),
  });
  assert.equal(wrongType.response.status, 422);
  assert.equal(wrongType.body.error.code, "INVALID_SELLER_NOTE");

  const tooLong = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "x".repeat(5_001), expectedVersion: saved.body.note.version }),
  });
  assert.equal(tooLong.response.status, 422);

  const invalidVersion = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "Valid note", expectedVersion: 1.5 }),
  });
  assert.equal(invalidVersion.response.status, 422);
  assert.equal(invalidVersion.body.error.code, "INVALID_SELLER_NOTE_VERSION");

  const concurrentVersion = reloaded.body.note.version;
  const saveConcurrent = (nextBody) => jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: nextBody, expectedVersion: concurrentVersion }),
  });
  const concurrent = await Promise.all([
    saveConcurrent("Courier handoff A"),
    saveConcurrent("Courier handoff B"),
  ]);
  assert.deepEqual(
    concurrent.map(({ response }) => response.status).sort((a, b) => a - b),
    [200, 409],
  );

  const latest = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`);
  const cleared = await jsonRequest(`/api/v1/seller/orders/${orderId}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "", expectedVersion: latest.body.note.version }),
  });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.body.note.body, "");

  const unknown = await jsonRequest("/api/v1/seller/orders/not-a-real-order/note");
  assert.equal(unknown.response.status, 404);
  assert.equal(unknown.body.error.code, "ORDER_NOT_FOUND");
});

test("blocks cross-wired order retries and tampered fulfilment windows", async () => {
  const conflicting = await jsonRequest("/api/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": "seed:order-demo-ready" },
    body: JSON.stringify({
      productId: "product-blush-garden",
      requestedDate: singaporeDateFromNow(4),
      fulfilmentMethod: "delivery",
      postcode: "160042",
      quantity: 1,
      buyer: { name: "Different Buyer", email: "different@example.com" },
      recipient: { name: "Alicia", phone: "91234821", address: "20 Tiong Bahru Road" },
    }),
  });
  assert.equal(conflicting.response.status, 409);
  assert.equal(conflicting.body.error.code, "IDEMPOTENCY_CONFLICT");

  const { date, product } = await findBookableDelivery();
  const tampered = await jsonRequest("/api/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `test:tampered-window:${Date.now()}`,
    },
    body: JSON.stringify({
      productId: product.id,
      requestedDate: date,
      fulfilmentMethod: "delivery",
      postcode: "160042",
      window: "12:00 am–1:00 am",
      quantity: 1,
      buyer: { name: "Jamie Lim", email: "jamie@example.com" },
      recipient: { name: "Alicia", phone: "91234821", address: "20 Tiong Bahru Road" },
    }),
  });
  assert.equal(tampered.response.status, 409);
  assert.equal(tampered.body.error.code, "WINDOW_CHANGED");
});

test("serializes concurrent transition and message retries", async () => {
  const { date, product } = await findBookableDelivery();
  const orderKey = `test:concurrent-order:${crypto.randomUUID()}`;
  const orderInput = {
    productId: product.id,
    requestedDate: date,
    fulfilmentMethod: "delivery",
    postcode: "160042",
    window: product.availability.window,
    quantity: 1,
    buyer: { name: "Concurrency Test", email: "concurrency@example.com" },
    recipient: {
      name: "Concurrency Recipient",
      phone: "91234821",
      address: "20 Tiong Bahru Road",
    },
  };
  const created = await jsonRequest("/api/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": orderKey },
    body: JSON.stringify(orderInput),
  });
  assert.equal(created.response.status, 201);
  const orderId = created.body.order.id;
  const sellerQuery = new URLSearchParams({
    sellerId: created.body.order.seller.id,
  }).toString();

  const publicTransition = await fetch(`${baseUrl}/api/v1/orders/${orderId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "decline", reason: "Must use the seller route." }),
  });
  assert.equal(publicTransition.status, 405);

  const transitionKey = `test:concurrent-decline:${crypto.randomUUID()}`;
  const transition = () => jsonRequest(`/api/v1/seller/orders/${orderId}?${sellerQuery}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "Idempotency-Key": transitionKey },
    body: JSON.stringify({
      action: "decline",
      reason: "Concurrency test releases this reservation exactly once.",
    }),
  });
  const transitions = await Promise.all([transition(), transition()]);
  assert.deepEqual(transitions.map(({ response }) => response.status), [200, 200]);

  const messageKey = `test:concurrent-message:${crypto.randomUUID()}`;
  const messageInput = {
    senderRole: "buyer",
    senderName: "Concurrency Test",
    body: "This exact retry should create one stored message.",
  };
  const sendMessage = () => jsonRequest(`/api/v1/orders/${orderId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": messageKey },
    body: JSON.stringify(messageInput),
  });
  const messages = await Promise.all([sendMessage(), sendMessage()]);
  assert.deepEqual(messages.map(({ response }) => response.status), [201, 201]);
  assert.equal(messages[0].body.message.id, messages[1].body.message.id);

  const detail = await jsonRequest(`/api/v1/orders/${orderId}`);
  assert.equal(detail.response.status, 200);
  assert.equal(
    detail.body.events.filter((event) => event.eventType === "order.declined").length,
    1,
  );
  assert.equal(
    detail.body.messages.filter((message) => message.body === messageInput.body).length,
    1,
  );
});

test("finished source has product metadata and interaction guardrails", async () => {
  const [page, layout, css, packageJson, consumer, seller, admin, tracker, dialogHook, serviceWorker, ordersLibrary, smartSearch, viteConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ConsumerMarketplace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SellerDashboardApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AdminConsoleApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/OrderTrackerApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/useAccessibleDialog.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/orders.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/smart-search.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page + layout, /Petalfolk/);
  assert.match(layout, /en-SG/);
  assert.match(layout, /Asia\/Singapore|Singapore/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  const remFontSizes = [...css.matchAll(/font-size:\s*([0-9.]+)rem/g)].map((match) => Number(match[1]));
  assert.ok(remFontSizes.length > 0);
  assert.ok(remFontSizes.every((size) => size >= 0.8125), "rem font sizes should stay at or above 13px");
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /codex-preview|_sites-preview/);
  assert.match(consumer, /CartItem[\s\S]*plan: MarketplacePlan/);
  assert.match(consumer, /requestKey\.current/);
  for (const label of ["Find flowers", "View arrangement", "Add to basket", "Continue to checkout", "Request order"]) {
    assert.match(consumer, new RegExp(label));
  }
  assert.match(consumer, /Describe the flowers/);
  assert.match(consumer, /roses \+ daisies, anniversary, black wrap/);
  assert.match(consumer, /Typos are okay/);
  const mobileCatalogueCss = css.slice(
    css.indexOf("@media (max-width: 768px)"),
    css.indexOf("@media (max-width: 480px)"),
  );
  assert.match(mobileCatalogueCss, /\.product-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mobileCatalogueCss, /\.product-card__cta\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(consumer, /product-card__cta-compact/);
  assert.match(consumer, /availability-badge__compact/);
  assert.match(consumer, /Any occasion/);
  assert.match(seller, /selectedDetail\?\.id === selectedId/);
  assert.match(seller, /actionsEnabled=\{selectedDetail\?\.id === selectedId && !detailError\}/);
  assert.match(seller, /Delivery destination/);
  assert.match(seller, /unreadMessages/);
  assert.match(seller, /order\.fulfilmentDate/);
  assert.match(seller, /Private seller note/);
  assert.match(seller, /Not shown in the buyer view/);
  assert.match(seller, /Save note/);
  assert.match(seller, /maxLength=\{5_000\}/);
  assert.doesNotMatch(tracker, /Private seller note|seller-order-note/);
  assert.doesNotMatch(seller + admin, /sampleCapacity|sampleReviews|sampleExceptions|sampleEvents/);
  assert.match(tracker, /out_for_delivery/);
  assert.match(tracker, /formElement\.reset\(\)/);
  assert.match(dialogHook, /event\.key === "Escape"/);
  assert.match(dialogHook, /event\.key !== "Tab"/);
  assert.match(dialogHook, /element\.inert = true/);
  assert.match(serviceWorker, /PRIVATE_ROUTE_PREFIXES/);
  assert.match(serviceWorker, /no-store\|private/);
  assert.match(serviceWorker, /offline\.html/);
  assert.match(ordersLibrary, /singaporeDate\(new Date\(now\)\)/);
  assert.equal((smartSearch.match(/json_schema:\s*INTENT_SCHEMA/g) ?? []).length, 1);
  assert.equal(
    (smartSearch.match(/json_schema:\s*\{\s*name:\s*"flower_search_intent"/g) ?? []).length,
    1,
  );
  assert.match(viteConfig, /ai:\s*\{\s*binding:\s*"AI",\s*remote:\s*true\s*\}/);
});
