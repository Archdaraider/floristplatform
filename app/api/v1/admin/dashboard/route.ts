import { adminDashboard } from "@/lib/admin";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    return Response.json(await adminDashboard(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}
