export type FulfilmentMethod = "delivery" | "pickup";

export type Product = {
  id: string;
  slug: string;
  sellerId: string;
  sellerName: string;
  sellerSlug?: string;
  sellerArea: string;
  sellerType?: string;
  verified: boolean;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  imageAlt?: string;
  style: string;
  occasions: string[];
  flowerTypes?: string[];
  leadTimeHours: number;
  fulfilmentMethods: FulfilmentMethod[];
  deliveryFeeCents: number;
  pickupLabel?: string | null;
  capacityRemaining: number;
  availableWindows: string[];
  confirmationMinutes?: number;
  rating?: number;
  reviewCount?: number;
  stemCount?: string;
  includedItems?: string[];
  dimensions?: string;
  representativePhotoDisclosure?: string;
  policies?: {
    cancellation?: string;
    substitution?: string;
    freshness?: string;
    sellerManagedDelivery?: string;
  };
  status?: "published" | "paused";
  representativePhoto?: boolean;
};

export type Seller = {
  id: string;
  name: string;
  slug?: string;
  area: string;
  sellerType?: string;
  verified: boolean;
  acceptingOrders?: boolean;
  story?: string;
  publicAddress?: string;
  fulfilmentMethods?: FulfilmentMethod[];
  defaultLeadTimeHours?: number;
};

export type OrderEvent = {
  id?: string;
  type?: string;
  label?: string;
  actor?: string;
  actorRole?: string;
  detail?: string;
  createdAt: string;
};

export type Message = {
  id: string;
  authorName: string;
  authorRole: "buyer" | "seller" | "support" | "system";
  body: string;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  productSnapshot?: Product;
  buyerName: string;
  buyerEmail: string;
  recipientName: string;
  recipientPhone?: string;
  fulfilmentMethod: FulfilmentMethod;
  fulfilmentDate: string;
  fulfilmentWindow: string;
  postcode?: string;
  addressLine?: string;
  deliveryInstructions?: string;
  publicPickupArea?: string;
  pickupLocation?: string | null;
  privatePickupInstructions?: string | null;
  cardMessage?: string;
  substitutionPreference?: string;
  quantity: number;
  itemSubtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  commissionCents?: number;
  payoutCents?: number;
  commercialStatus: string;
  productionStatus?: string;
  fulfilmentStatus?: string;
  paymentStatus: string;
  payoutStatus?: string;
  acceptBy: string;
  nextAction?: string;
  nextActionOwner?: string;
  allowedActions?: string[];
  createdAt: string;
  events?: OrderEvent[];
  messages?: Message[];
  unreadBuyerMessages?: number;
  lastBuyerMessageAt?: string;
};

export type SellerDashboard = {
  demoMode: boolean;
  seller: Seller;
  orders: Order[];
  products: Product[];
  metrics?: {
    awaitingAcceptance?: number;
    dueToday?: number;
    unreadMessages?: number;
    capacityUsed?: number;
    capacityTotal?: number;
    payoutPendingCents?: number;
    salesThisWeekCents?: number;
  };
  capacity?: Array<{
    date: string;
    label?: string;
    used: number;
    total: number;
  }>;
};

export function formatSgd(cents: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatSingaporeDate(date: string, includeTime = false) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(parsed);
}

export function humanizeStatus(value?: string) {
  if (!value) return "Not started";
  return value
    .replace(/[._-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
