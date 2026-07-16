export const DEMO_MODE = true as const;
export const MARKET_TIMEZONE = "Asia/Singapore" as const;
export const MARKET_CURRENCY = "SGD" as const;

export type FulfilmentMethod = "pickup" | "delivery";
export type SellerStatus =
  | "pending_review"
  | "active"
  | "paused"
  | "restricted"
  | "suspended";
export type ProductStatus = "draft" | "published" | "paused" | "archived";
export type OperationalStatus =
  | "awaiting_acceptance"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "fulfilled"
  | "declined";
export type CommercialStatus =
  | "awaiting_seller"
  | "confirmed"
  | "declined"
  | "completed";
export type PaymentStatus = "authorised" | "captured" | "voided";
export type PayoutStatus =
  | "not_started"
  | "payout_pending"
  | "payout_available"
  | "paid"
  | "voided";
export type OrderAction =
  | "accept"
  | "decline"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "fulfilled";

export type AvailabilityReason =
  | "SELLER_NOT_ACTIVE"
  | "SELLER_NOT_VERIFIED"
  | "SELLER_PAYMENT_NOT_READY"
  | "SELLER_PAUSED"
  | "PRODUCT_NOT_PUBLISHED"
  | "METHOD_DISABLED"
  | "DATE_REQUIRED"
  | "DATE_IN_PAST"
  | "LEAD_TIME_NOT_MET"
  | "POSTCODE_REQUIRED"
  | "POSTCODE_UNSUPPORTED"
  | "CAPACITY_FULL"
  | "SLOT_UNAVAILABLE"
  | "OVER_BUDGET";

export interface CatalogContext {
  requestedDate: string;
  method: FulfilmentMethod;
  postcode?: string;
  budgetMaxCents?: number;
  style?: string;
  occasion?: string;
  query?: string;
  timezone: typeof MARKET_TIMEZONE;
  queriedAt: string;
}

export interface SellerSummary {
  id: string;
  slug: string;
  tradingName: string;
  sellerType: "home" | "studio" | "store";
  verificationStatus: "pending" | "verified" | "needs_information";
  status: SellerStatus;
  publicArea: string;
  /** Exact addresses exist only for approved public premises. Home sellers never populate this. */
  publicAddress?: string;
  publicStory: string;
  styleTags: string[];
  methods: FulfilmentMethod[];
  rating: number;
  reviewCount: number;
  acceptingNewOrders: boolean;
  pausedUntil?: string;
}

export interface AvailabilityResult {
  bookable: boolean;
  reasons: AvailabilityReason[];
  requestedDate: string;
  method: FulfilmentMethod;
  window?: string;
  deliveryFeeCents: number;
  totalCents: number;
  remainingCapacity: number;
  publicArea: string;
  confirmationMinutes: number;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  currency: typeof MARKET_CURRENCY;
  imageUrl: string;
  imageAlt: string;
  occasionTags: string[];
  styleTags: string[];
  flowerTags: string[];
  leadTimeHours: number;
  methods: FulfilmentMethod[];
  seller: SellerSummary;
  availability: AvailabilityResult;
}

export interface ProductDetail extends CatalogProduct {
  representativePhotoDisclosure: string;
  dimensions: string;
  policies: {
    cancellation: string;
    substitution: string;
    freshness: string;
    sellerManagedDelivery: string;
  };
}

export interface MoneyBreakdown {
  subtotalCents: number;
  deliveryCents: number;
  platformFeeCents: number;
  taxCents: number;
  totalCents: number;
  commissionCents: number;
  sellerNetCents: number;
  currency: typeof MARKET_CURRENCY;
}

export interface ProductSnapshot {
  productId: string;
  slug: string;
  title: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  sellerName: string;
  representativePhotoDisclosure: string;
}

export interface FeeSnapshot {
  deliveryZone?: string;
  deliveryFeeCents: number;
  commissionBps: number;
  gstRegistered: boolean;
  capturedAtCheckout: string;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  seller: SellerSummary;
  commercialStatus: CommercialStatus;
  operationalStatus: OperationalStatus;
  paymentStatus: PaymentStatus;
  payoutStatus: PayoutStatus;
  fulfilmentMethod: FulfilmentMethod;
  requestedDate: string;
  timezone: typeof MARKET_TIMEZONE;
  window: string;
  deliveryPostcode?: string;
  confirmBy: string;
  confirmedAt?: string;
  completedAt?: string;
  productSnapshot: ProductSnapshot;
  feeSnapshot: FeeSnapshot;
  totals: MoneyBreakdown;
  nextAction: {
    owner: "buyer" | "seller" | "none";
    label: string;
    deadline?: string;
  };
  allowedActions: OrderAction[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderView {
  buyer: { name: string; email: string };
  recipient?: { name?: string; phone?: string; address?: string };
  /** Approved public collection point for pickup orders. Home addresses are never projected. */
  pickupLocation?: string;
  giftMessage?: string;
  deliveryInstructions?: string;
  policies: ProductDetail["policies"];
}

export interface SellerOrderSummary extends OrderView {
  recipientName: string;
}

export interface OrderEventView {
  id: string;
  orderId: string;
  actorRole: "buyer" | "seller" | "support" | "system";
  eventType: string;
  fromState?: string;
  toState?: string;
  reason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MessageView {
  id: string;
  orderId: string;
  senderRole: "buyer" | "seller" | "support" | "system";
  senderName: string;
  body: string;
  messageType: "message" | "system";
  readAt?: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    correlationId: string;
    retryable: boolean;
    fieldErrors?: Record<string, string>;
    recovery?: string;
  };
  demoMode: typeof DEMO_MODE;
}

export interface CreateOrderInput {
  productId?: string;
  productSlug?: string;
  requestedDate: string;
  fulfilmentMethod: FulfilmentMethod;
  postcode?: string;
  window?: string;
  quantity?: number;
  buyer: { name: string; email: string };
  recipient?: { name?: string; phone?: string; address?: string };
  giftMessage?: string;
  deliveryInstructions?: string;
}

export interface TransitionOrderInput {
  action: OrderAction;
  reason?: string;
}
