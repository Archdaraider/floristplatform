import { errorResponse } from "@/lib/api";
import { catalog, parseCatalogContext } from "@/lib/availability";
import { interpretSmartSearch } from "@/lib/smart-search";

export async function GET(request: Request) {
  try {
    const context = parseCatalogContext(new URL(request.url));
    const intent = context.query ? await interpretSmartSearch(context.query) : undefined;
    return Response.json(await catalog(context, intent), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}
