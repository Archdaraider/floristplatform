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

test("server-renders the consumer marketplace", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Independent Singapore florists — Petalfolk/);
  assert.match(html, /Flowers that can/);
  assert.match(html, /Checking/);
  assert.match(html, /Availability checked at checkout/);
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
  assert.match(html, /Checking order intake/);
  assert.match(html, /Pending payout/);
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

test("scopes message idempotency to the requested order and payload", async () => {
  const headers = {
    "content-type": "application/json",
    "Idempotency-Key": "seed:message-awaiting-buyer",
  };
  const input = {
    senderRole: "buyer",
    senderName: "Alex",
    body: "Cross-order replay protection stays scoped to this order.",
  };
  const first = await jsonRequest("/api/v1/orders/order-demo-ready/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.message.orderId, "order-demo-ready");

  const mismatch = await jsonRequest("/api/v1/orders/order-demo-ready/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, body: "A different command payload." }),
  });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.error.code, "IDEMPOTENCY_CONFLICT");
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

  const transitionKey = `test:concurrent-decline:${crypto.randomUUID()}`;
  const transition = () => jsonRequest(`/api/v1/orders/${orderId}`, {
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
  const [page, layout, css, packageJson, consumer, seller, admin, tracker, dialogHook, serviceWorker] = await Promise.all([
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
  ]);

  assert.match(page + layout, /Petalfolk/);
  assert.match(layout, /en-SG/);
  assert.match(layout, /Asia\/Singapore|Singapore/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /codex-preview|_sites-preview/);
  assert.match(consumer, /CartItem[\s\S]*plan: MarketplacePlan/);
  assert.match(consumer, /requestKey\.current/);
  assert.match(seller, /selectedDetail\?\.id === selectedId/);
  assert.match(seller, /actionsEnabled=\{selectedDetail\?\.id === selectedId && !detailError\}/);
  assert.match(seller, /Delivery destination/);
  assert.doesNotMatch(seller + admin, /sampleCapacity|sampleReviews|sampleExceptions|sampleEvents/);
  assert.match(tracker, /out_for_delivery/);
  assert.match(tracker, /formElement\.reset\(\)/);
  assert.match(dialogHook, /event\.key === "Escape"/);
  assert.match(dialogHook, /event\.key !== "Tab"/);
  assert.match(dialogHook, /element\.inert = true/);
  assert.match(serviceWorker, /PRIVATE_ROUTE_PREFIXES/);
  assert.match(serviceWorker, /no-store\|private/);
  assert.match(serviceWorker, /offline\.html/);
});
