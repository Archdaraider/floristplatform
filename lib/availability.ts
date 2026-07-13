import { ensureDemoDatabase } from "../db/bootstrap";
import { ApiError } from "./api";
import {
  DEMO_MODE,
  MARKET_CURRENCY,
  MARKET_TIMEZONE,
  type AvailabilityReason,
  type AvailabilityResult,
  type CatalogContext,
  type CatalogProduct,
  type FulfilmentMethod,
  type ProductDetail,
  type SellerSummary,
} from "./types";
import {
  hoursUntilSingaporeDate,
  isValidLocalDate,
  localDateFromNow,
  nowIso,
  singaporeDate,
} from "./time";

export interface MarketplaceRow {
  product_id: string;
  product_slug: string;
  product_title: string;
  product_description: string;
  product_status: "draft" | "published" | "paused" | "archived";
  base_price_cents: number;
  currency: "SGD";
  occasion_tags_json: string;
  product_style_tags_json: string;
  flower_tags_json: string;
  image_url: string;
  image_alt: string;
  representative_photo_disclosure: string;
  dimensions: string;
  product_methods_json: string;
  lead_time_hours: number;
  policy_snapshot_json: string;
  seller_id: string;
  seller_slug: string;
  trading_name: string;
  seller_type: "home" | "studio" | "store";
  seller_status: "pending_review" | "active" | "paused" | "restricted" | "suspended";
  verification_status: "pending" | "verified" | "needs_information";
  accepting_new_orders: number;
  paused_until: string | null;
  public_story: string;
  public_area: string;
  public_address: string | null;
  seller_style_tags_json: string;
  seller_methods_json: string;
  response_sla_minutes: number;
  rating_hundredths: number;
  review_count: number;
  gst_registered: number;
  commission_bps: number;
  capacity_id: string | null;
  window_label: string | null;
  total_capacity: number | null;
  reserved_capacity: number | null;
  committed_capacity: number | null;
  zone_name: string | null;
  postal_sectors_json: string | null;
  zone_fee_cents: number | null;
  zone_window_label: string | null;
}

const MARKETPLACE_SELECT = `
SELECT
  p.id AS product_id,
  p.slug AS product_slug,
  p.title AS product_title,
  p.description AS product_description,
  p.status AS product_status,
  p.base_price_cents,
  p.currency,
  p.occasion_tags_json,
  p.style_tags_json AS product_style_tags_json,
  p.flower_tags_json,
  p.image_url,
  p.image_alt,
  p.representative_photo_disclosure,
  p.dimensions,
  p.fulfilment_methods_json AS product_methods_json,
  p.lead_time_hours,
  p.policy_snapshot_json,
  s.id AS seller_id,
  s.slug AS seller_slug,
  s.trading_name,
  s.seller_type,
  s.status AS seller_status,
  s.verification_status,
  s.accepting_new_orders,
  s.paused_until,
  s.public_story,
  s.public_area,
  s.public_address,
  s.style_tags_json AS seller_style_tags_json,
  s.fulfilment_methods_json AS seller_methods_json,
  s.response_sla_minutes,
  s.rating_hundredths,
  s.review_count,
  s.gst_registered,
  s.commission_bps,
  c.id AS capacity_id,
  c.window_label,
  c.total_capacity,
  c.reserved_capacity,
  c.committed_capacity,
  z.name AS zone_name,
  z.postal_sectors_json,
  z.fee_cents AS zone_fee_cents,
  z.window_label AS zone_window_label
FROM products p
JOIN sellers s ON s.id = p.seller_id
LEFT JOIN capacity_slots c
  ON c.seller_id = s.id AND c.date_local = ? AND c.method = ?
LEFT JOIN delivery_zones z
  ON z.seller_id = s.id AND z.enabled = 1
`;

function arrayJson(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function objectJson<T extends object>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

export function parseCatalogContext(url: URL): CatalogContext {
  const requestedDate = url.searchParams.get("date")?.trim() || localDateFromNow(3);
  const methodRaw = url.searchParams.get("method")?.trim().toLowerCase() || "delivery";
  if (methodRaw !== "pickup" && methodRaw !== "delivery") {
    throw new ApiError(
      "INVALID_METHOD",
      "Fulfilment method must be pickup or delivery.",
      400,
      false,
      { method: "Use pickup or delivery." }
    );
  }

  if (!isValidLocalDate(requestedDate)) {
    throw new ApiError(
      "INVALID_DATE",
      "Date must use YYYY-MM-DD in Asia/Singapore.",
      400,
      false,
      { date: "Use YYYY-MM-DD." }
    );
  }

  const budgetCentsRaw = url.searchParams.get("budgetCents");
  const budgetDollarsRaw = url.searchParams.get("budget");
  let budgetMaxCents: number | undefined;
  if (budgetCentsRaw || budgetDollarsRaw) {
    const parsed = Number(budgetCentsRaw ?? budgetDollarsRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ApiError(
        "INVALID_BUDGET",
        "Budget must be a positive SGD amount.",
        400,
        false,
        { budget: "Use a positive number." }
      );
    }
    budgetMaxCents = budgetCentsRaw ? Math.round(parsed) : Math.round(parsed * 100);
  }

  const postcode =
    methodRaw === "delivery"
      ? url.searchParams.get("postcode")?.replace(/\s/g, "") || "160042"
      : undefined;

  return {
    requestedDate,
    method: methodRaw,
    ...(postcode ? { postcode } : {}),
    ...(budgetMaxCents !== undefined ? { budgetMaxCents } : {}),
    ...(url.searchParams.get("style")?.trim()
      ? { style: url.searchParams.get("style")!.trim() }
      : {}),
    ...(url.searchParams.get("occasion")?.trim()
      ? { occasion: url.searchParams.get("occasion")!.trim() }
      : {}),
    timezone: MARKET_TIMEZONE,
    queriedAt: nowIso(),
  };
}

function postcodeSector(postcode?: string): string | undefined {
  if (!postcode || !/^\d{6}$/.test(postcode)) return undefined;
  return postcode.slice(0, 2);
}

export function mapSellerSummary(row: MarketplaceRow): SellerSummary {
  return {
    id: row.seller_id,
    slug: row.seller_slug,
    tradingName: row.trading_name,
    sellerType: row.seller_type,
    verificationStatus: row.verification_status,
    status: row.seller_status,
    publicArea: row.public_area,
    // Home sellers are intentionally never projected with a precise address.
    ...(row.seller_type !== "home" && row.public_address
      ? { publicAddress: row.public_address }
      : {}),
    publicStory: row.public_story,
    styleTags: arrayJson(row.seller_style_tags_json),
    methods: arrayJson(row.seller_methods_json) as FulfilmentMethod[],
    rating: row.rating_hundredths / 100,
    reviewCount: row.review_count,
    acceptingNewOrders: Boolean(row.accepting_new_orders),
    ...(row.paused_until ? { pausedUntil: row.paused_until } : {}),
  };
}

/** The single bookability calculation used by search, product detail, and checkout. */
export function calculateAvailability(
  row: MarketplaceRow,
  context: CatalogContext,
  now = new Date()
): AvailabilityResult {
  const reasons: AvailabilityReason[] = [];
  const sellerMethods = arrayJson(row.seller_methods_json);
  const productMethods = arrayJson(row.product_methods_json);
  const zoneSectors = arrayJson(row.postal_sectors_json);
  const sector = postcodeSector(context.postcode);
  const methodEnabled =
    sellerMethods.includes(context.method) && productMethods.includes(context.method);

  if (row.seller_status !== "active") reasons.push("SELLER_NOT_ACTIVE");
  if (!row.accepting_new_orders || (row.paused_until && new Date(row.paused_until) > now)) {
    reasons.push("SELLER_PAUSED");
  }
  if (row.product_status !== "published") reasons.push("PRODUCT_NOT_PUBLISHED");
  if (!methodEnabled) reasons.push("METHOD_DISABLED");
  if (context.requestedDate < singaporeDate(now)) reasons.push("DATE_IN_PAST");
  if (hoursUntilSingaporeDate(context.requestedDate, now) < row.lead_time_hours) {
    reasons.push("LEAD_TIME_NOT_MET");
  }
  if (!row.capacity_id) reasons.push("SLOT_UNAVAILABLE");

  const remainingCapacity = Math.max(
    0,
    (row.total_capacity ?? 0) -
      (row.reserved_capacity ?? 0) -
      (row.committed_capacity ?? 0)
  );
  if (row.capacity_id && remainingCapacity <= 0) reasons.push("CAPACITY_FULL");

  let deliveryFeeCents = 0;
  if (context.method === "delivery") {
    if (!sector) {
      reasons.push("POSTCODE_REQUIRED");
    } else if (!row.zone_name || (!zoneSectors.includes("*") && !zoneSectors.includes(sector))) {
      reasons.push("POSTCODE_UNSUPPORTED");
    } else {
      deliveryFeeCents = row.zone_fee_cents ?? 0;
    }
  }

  const totalCents = row.base_price_cents + deliveryFeeCents;
  if (context.budgetMaxCents !== undefined && totalCents > context.budgetMaxCents) {
    reasons.push("OVER_BUDGET");
  }

  return {
    bookable: reasons.length === 0,
    reasons: [...new Set(reasons)],
    requestedDate: context.requestedDate,
    method: context.method,
    ...(row.window_label || row.zone_window_label
      ? { window: row.window_label ?? row.zone_window_label ?? undefined }
      : {}),
    deliveryFeeCents,
    totalCents,
    remainingCapacity,
    publicArea: row.public_area,
    confirmationMinutes: row.response_sla_minutes,
  };
}

export function mapCatalogProduct(
  row: MarketplaceRow,
  context: CatalogContext
): CatalogProduct {
  return {
    id: row.product_id,
    slug: row.product_slug,
    title: row.product_title,
    description: row.product_description,
    priceCents: row.base_price_cents,
    currency: MARKET_CURRENCY,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    occasionTags: arrayJson(row.occasion_tags_json),
    styleTags: arrayJson(row.product_style_tags_json),
    flowerTags: arrayJson(row.flower_tags_json),
    leadTimeHours: row.lead_time_hours,
    methods: arrayJson(row.product_methods_json) as FulfilmentMethod[],
    seller: mapSellerSummary(row),
    availability: calculateAvailability(row, context),
  };
}

function matchesFilter(product: CatalogProduct, context: CatalogContext) {
  const normalise = (value: string) => value.trim().toLowerCase();
  const matchesTag = (tags: string[], wanted?: string) =>
    !wanted || tags.some((tag) => normalise(tag) === normalise(wanted));
  return (
    matchesTag(product.styleTags, context.style) &&
    matchesTag(product.occasionTags, context.occasion)
  );
}

export async function catalog(context: CatalogContext) {
  const database = await ensureDemoDatabase();
  const result = await database
    .prepare(`${MARKETPLACE_SELECT} ORDER BY p.base_price_cents ASC`)
    .bind(context.requestedDate, context.method)
    .all<MarketplaceRow>();
  const allProducts = result.results.map((row) => mapCatalogProduct(row, context));
  const products = allProducts.filter(
    (product) => product.availability.bookable && matchesFilter(product, context)
  );
  const sellers = Array.from(
    new Map(products.map((product) => [product.seller.id, product.seller])).values()
  );

  return { products, sellers, context, demoMode: DEMO_MODE };
}

export async function findMarketplaceRow(
  productReference: { id?: string; slug?: string },
  context: CatalogContext
): Promise<MarketplaceRow | null> {
  const database = await ensureDemoDatabase();
  const predicate = productReference.id ? "p.id = ?" : "p.slug = ?";
  const value = productReference.id ?? productReference.slug;
  if (!value) return null;
  return database
    .prepare(`${MARKETPLACE_SELECT} WHERE ${predicate} LIMIT 1`)
    .bind(context.requestedDate, context.method, value)
    .first<MarketplaceRow>();
}

export async function productDetail(slug: string, context: CatalogContext) {
  const row = await findMarketplaceRow({ slug }, context);
  if (!row) {
    throw new ApiError("PRODUCT_NOT_FOUND", "That floral design could not be found.", 404);
  }
  const product: ProductDetail = {
    ...mapCatalogProduct(row, context),
    representativePhotoDisclosure: row.representative_photo_disclosure,
    dimensions: row.dimensions,
    policies: objectJson<ProductDetail["policies"]>(row.policy_snapshot_json),
  };
  return { product, demoMode: DEMO_MODE };
}
