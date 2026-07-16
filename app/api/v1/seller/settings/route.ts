import { errorResponse, jsonBody } from "@/lib/api";
import { MAIN_DEMO_SELLER_ID, updateSellerSettings } from "@/lib/seller";

export async function PATCH(request: Request) {
  try {
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    const input = await jsonBody<{
      acceptingNewOrders?: boolean;
      paused?: boolean;
      pausedUntil?: string | null;
    }>(request);
    return Response.json(await updateSellerSettings(input, sellerId));
  } catch (error) {
    return errorResponse(error, request);
  }
}
