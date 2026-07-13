import { errorResponse, idempotencyKey, jsonBody } from "@/lib/api";
import { getOrderBundle, transitionOrder } from "@/lib/orders";
import type { TransitionOrderInput } from "@/lib/types";

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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = await jsonBody<TransitionOrderInput>(request);
    return Response.json(
      await transitionOrder(id, input, idempotencyKey(request, `order:${id}:transition`))
    );
  } catch (error) {
    return errorResponse(error, request);
  }
}
