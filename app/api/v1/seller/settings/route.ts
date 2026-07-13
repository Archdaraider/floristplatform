import { errorResponse, jsonBody } from "@/lib/api";
import { updateSellerSettings } from "@/lib/seller";

export async function PATCH(request: Request) {
  try {
    const input = await jsonBody<{
      acceptingNewOrders?: boolean;
      paused?: boolean;
      pausedUntil?: string | null;
    }>(request);
    return Response.json(await updateSellerSettings(input));
  } catch (error) {
    return errorResponse(error, request);
  }
}
