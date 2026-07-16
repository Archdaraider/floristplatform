import { errorResponse, jsonBody } from "@/lib/api";
import {
  getSellerOrderNote,
  MAIN_DEMO_SELLER_ID,
  updateSellerOrderNote,
} from "@/lib/seller";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const privateHeaders = {
  "cache-control": "no-store, private",
};

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
    return Response.json(await getSellerOrderNote(id, sellerId), {
      headers: privateHeaders,
    });
  } catch (error) {
    return privateErrorResponse(error, request);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    const input = await jsonBody<{ body?: string; expectedVersion?: number }>(request);
    return Response.json(await updateSellerOrderNote(id, input, sellerId), {
      headers: privateHeaders,
    });
  } catch (error) {
    return privateErrorResponse(error, request);
  }
}
