import "server-only";

import { headers } from "next/headers";

const LOCAL_FALLBACK_HOST = "localhost:3000";

function normalizedHost(value: string | null): string {
  const candidate = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?$/.test(candidate)) {
    return LOCAL_FALLBACK_HOST;
  }
  try {
    void new URL(`http://${candidate}`);
    return candidate;
  } catch {
    return LOCAL_FALLBACK_HOST;
  }
}

export async function incomingSiteOrigin(): Promise<URL> {
  const requestHeaders = await headers();
  const host = normalizedHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return new URL(`${protocol}://${host}`);
}
