import { errorResponse, idempotencyKey, jsonBody } from "@/lib/api";
import {
  addSellerOrderMessage,
  MAIN_DEMO_SELLER_ID,
} from "@/lib/seller";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const privateHeaders = { "cache-control": "no-store, private" };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    const input = await jsonBody<{ body?: string }>(request);
    return Response.json(
      await addSellerOrderMessage(
        id,
        input,
        idempotencyKey(request, `seller:${sellerId}:order:${id}:message`),
        sellerId,
      ),
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    const response = errorResponse(error, request);
    response.headers.set("cache-control", privateHeaders["cache-control"]);
    return response;
  }
}
