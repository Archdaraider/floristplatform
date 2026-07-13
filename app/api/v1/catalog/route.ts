import { errorResponse } from "@/lib/api";
import { catalog, parseCatalogContext } from "@/lib/availability";

export async function GET(request: Request) {
  try {
    const context = parseCatalogContext(new URL(request.url));
    return Response.json(await catalog(context), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}
