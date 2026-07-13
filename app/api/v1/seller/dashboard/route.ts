import { errorResponse } from "@/lib/api";
import { sellerDashboard } from "@/lib/seller";

export async function GET(request: Request) {
  try {
    return Response.json(await sellerDashboard(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}
