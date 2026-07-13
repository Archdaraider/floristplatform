import { errorResponse, jsonBody } from "@/lib/api";
import { parseCatalogContext, productDetail } from "@/lib/availability";
import { updateProductStatus } from "@/lib/seller";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const availabilityContext = parseCatalogContext(new URL(request.url));
    return Response.json(await productDetail(slug, availabilityContext), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}

/** The same resource path accepts a product id for seller publish/pause commands. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { slug: id } = await context.params;
    const input = await jsonBody<{ status?: "published" | "paused"; published?: boolean }>(
      request
    );
    return Response.json(await updateProductStatus(id, input));
  } catch (error) {
    return errorResponse(error, request);
  }
}
