import { errorResponse, idempotencyKey, jsonBody } from "@/lib/api";
import { addOrderMessage } from "@/lib/orders";
import type { MessageView } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = await jsonBody<{
      senderRole?: MessageView["senderRole"];
      senderName?: string;
      body?: string;
    }>(request);
    const result = await addOrderMessage(
      id,
      input,
      idempotencyKey(request, `order:${id}:message`)
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, request);
  }
}
