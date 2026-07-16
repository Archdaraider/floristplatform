import { errorResponse } from "@/lib/api";
import { getOrderBundle } from "@/lib/orders";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return Response.json(await getOrderBundle(id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}
