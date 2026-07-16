import { errorResponse, idempotencyKey, jsonBody } from "@/lib/api";
import {
  getSellerOrderBundle,
  MAIN_DEMO_SELLER_ID,
  transitionSellerOrder,
} from "@/lib/seller";
import type { TransitionOrderInput } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const privateHeaders = { "cache-control": "no-store, private" };

function privateErrorResponse(error: unknown, request: Request) {
  const response = errorResponse(error, request);
  response.headers.set("cache-control", privateHeaders["cache-control"]);
  return response;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    return Response.json(await getSellerOrderBundle(id, sellerId), {
      headers: privateHeaders,
    });
  } catch (error) {
    return privateErrorResponse(error, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    const input = await jsonBody<TransitionOrderInput>(request);
    return Response.json(
      await transitionSellerOrder(
        id,
        input,
        idempotencyKey(request, `seller:${sellerId}:order:${id}:transition`),
        sellerId,
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return privateErrorResponse(error, request);
  }
}
