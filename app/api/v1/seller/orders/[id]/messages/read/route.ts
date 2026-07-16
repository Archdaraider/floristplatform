import { errorResponse, jsonBody } from "@/lib/api";
import {
  MAIN_DEMO_SELLER_ID,
  markSellerOrderMessagesRead,
} from "@/lib/seller";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const privateHeaders = {
  "cache-control": "no-store, private",
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    const input = await jsonBody<{ throughMessageId?: string }>(request);
    return Response.json(
      await markSellerOrderMessagesRead(id, input, sellerId),
      { headers: privateHeaders }
    );
  } catch (error) {
    const response = errorResponse(error, request);
    response.headers.set("cache-control", privateHeaders["cache-control"]);
    return response;
  }
}
