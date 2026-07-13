/* global self, caches */

const CACHE_VERSION = "petalfolk-mvp-v3";
const PUBLIC_SHELL_ROUTES = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/offline.html",
];
const PRIVATE_ROUTE_PREFIXES = ["/seller", "/admin", "/order"];

function canCache(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  return response.ok && !/\b(?:no-store|private)\b/i.test(cacheControl);
}

async function precachePublicShell() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(
    PUBLIC_SHELL_ROUTES.map(async (route) => {
      try {
        const response = await fetch(route, { cache: "reload" });
        if (canCache(response)) await cache.put(route, response);
      } catch {
        // One optional shell asset should not prevent a safer worker from installing.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precachePublicShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isPrivateRoute = PRIVATE_ROUTE_PREFIXES.some((prefix) =>
    url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  const isStaticAsset = ["style", "script", "image", "font", "manifest"].includes(
    request.destination,
  );
  const isPublicHomeNavigation = request.mode === "navigate" && url.pathname === "/";

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    isPrivateRoute ||
    (!isStaticAsset && !isPublicHomeNavigation)
  ) {
    return;
  }

  let cacheWrite = Promise.resolve();
  const responsePromise = fetch(request)
      .then((response) => {
        if (canCache(response)) {
          const clone = response.clone();
          cacheWrite = caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put(request, clone))
            .catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isPublicHomeNavigation) {
          return (await caches.match("/offline.html")) ?? Response.error();
        }
        return Response.error();
      });

  event.respondWith(responsePromise);
  event.waitUntil(responsePromise.then(() => cacheWrite, () => cacheWrite));
});
