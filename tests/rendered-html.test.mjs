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
  assert.match(html, /Accepting orders/);
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

test("finished source has product metadata and interaction guardrails", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page + layout, /Petalfolk/);
  assert.match(layout, /en-SG/);
  assert.match(layout, /Asia\/Singapore|Singapore/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /codex-preview|_sites-preview/);
});
