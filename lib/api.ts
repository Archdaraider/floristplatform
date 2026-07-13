import { DEMO_MODE, type ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
    public readonly fieldErrors?: Record<string, string>,
    public readonly recovery?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function correlationId(request?: Request): string {
  return request?.headers.get("x-correlation-id") ?? crypto.randomUUID();
}

export function errorResponse(error: unknown, request?: Request): Response {
  if (!(error instanceof ApiError)) {
    // Keep diagnostics structured and exclude request/body data or free-text messages.
    console.error("marketplace_api_error", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown runtime error",
    });
  }
  const safe =
    error instanceof ApiError
      ? error
      : new ApiError(
          "INTERNAL_ERROR",
          "Something went wrong while processing this demo request.",
          500,
          true,
          undefined,
          "Retry the request. If it persists, restart the local demo server."
        );

  const body: ApiErrorBody = {
    error: {
      code: safe.code,
      message: safe.message,
      correlationId: correlationId(request),
      retryable: safe.retryable,
      ...(safe.fieldErrors ? { fieldErrors: safe.fieldErrors } : {}),
      ...(safe.recovery ? { recovery: safe.recovery } : {}),
    },
    demoMode: DEMO_MODE,
  };

  return Response.json(body, { status: safe.status });
}

export async function jsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON.", 400, false);
  }
}

export function idempotencyKey(request: Request, fallbackPrefix: string): string {
  const supplied = request.headers.get("idempotency-key")?.trim();
  if (supplied && supplied.length > 200) {
    throw new ApiError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must be 200 characters or fewer.",
      400,
      false
    );
  }
  return supplied || `${fallbackPrefix}:${crypto.randomUUID()}`;
}
