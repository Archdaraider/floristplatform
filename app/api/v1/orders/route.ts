import { errorResponse, idempotencyKey, jsonBody } from "@/lib/api";
import { createOrder } from "@/lib/orders";
import type { CreateOrderInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const input = await jsonBody<CreateOrderInput>(request);
    const result = await createOrder(input, idempotencyKey(request, "create-order"));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, request);
  }
}
