import { errorResponse } from "@/lib/api";
import { MAIN_DEMO_SELLER_ID, sellerDashboard } from "@/lib/seller";

export async function GET(request: Request) {
  try {
    const sellerId =
      new URL(request.url).searchParams.get("sellerId") || MAIN_DEMO_SELLER_ID;
    return Response.json(await sellerDashboard(sellerId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}
