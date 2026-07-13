import { getD1Binding } from ".";
import { addMinutesIso, localDateFromNow, nowIso } from "../lib/time";

const RUNTIME_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sellers (
  id text PRIMARY KEY NOT NULL,
  slug text NOT NULL,
  trading_name text NOT NULL,
  legal_name text NOT NULL,
  uen text,
  seller_type text NOT NULL,
  status text NOT NULL,
  verification_status text NOT NULL,
  psp_ready integer DEFAULT 0 NOT NULL,
  accepting_new_orders integer DEFAULT 0 NOT NULL,
  paused_until text,
  gst_registered integer DEFAULT 0 NOT NULL,
  commission_bps integer DEFAULT 1500 NOT NULL,
  public_story text NOT NULL,
  public_area text NOT NULL,
  public_address text,
  style_tags_json text DEFAULT '[]' NOT NULL,
  fulfilment_methods_json text DEFAULT '[]' NOT NULL,
  response_sla_minutes integer DEFAULT 60 NOT NULL,
  default_lead_time_hours integer DEFAULT 24 NOT NULL,
  rating_hundredths integer DEFAULT 0 NOT NULL,
  review_count integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT sellers_commission_bps_non_negative CHECK (commission_bps >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS sellers_slug_unique ON sellers (slug);
CREATE UNIQUE INDEX IF NOT EXISTS sellers_uen_unique ON sellers (uen);
CREATE INDEX IF NOT EXISTS sellers_status_idx ON sellers (status, verification_status);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id text PRIMARY KEY NOT NULL,
  seller_id text NOT NULL REFERENCES sellers(id),
  name text NOT NULL,
  postal_sectors_json text NOT NULL,
  fee_cents integer NOT NULL,
  window_label text NOT NULL,
  enabled integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT delivery_zones_fee_non_negative CHECK (fee_cents >= 0)
);
CREATE INDEX IF NOT EXISTS delivery_zones_seller_enabled_idx ON delivery_zones (seller_id, enabled);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY NOT NULL,
  seller_id text NOT NULL REFERENCES sellers(id),
  slug text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL,
  base_price_cents integer NOT NULL,
  currency text DEFAULT 'SGD' NOT NULL,
  occasion_tags_json text DEFAULT '[]' NOT NULL,
  style_tags_json text DEFAULT '[]' NOT NULL,
  flower_tags_json text DEFAULT '[]' NOT NULL,
  image_url text NOT NULL,
  image_alt text NOT NULL,
  representative_photo_disclosure text NOT NULL,
  dimensions text NOT NULL,
  fulfilment_methods_json text DEFAULT '[]' NOT NULL,
  lead_time_hours integer DEFAULT 24 NOT NULL,
  policy_snapshot_json text NOT NULL,
  published_at text,
  archived_at text,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT products_price_non_negative CHECK (base_price_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON products (slug);
CREATE INDEX IF NOT EXISTS products_seller_status_idx ON products (seller_id, status);

CREATE TABLE IF NOT EXISTS capacity_slots (
  id text PRIMARY KEY NOT NULL,
  seller_id text NOT NULL REFERENCES sellers(id),
  date_local text NOT NULL,
  method text NOT NULL,
  window_label text NOT NULL,
  total_capacity integer NOT NULL,
  reserved_capacity integer DEFAULT 0 NOT NULL,
  committed_capacity integer DEFAULT 0 NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT capacity_total_non_negative CHECK (total_capacity >= 0),
  CONSTRAINT capacity_reserved_non_negative CHECK (reserved_capacity >= 0),
  CONSTRAINT capacity_committed_non_negative CHECK (committed_capacity >= 0),
  CONSTRAINT capacity_not_overbooked CHECK (reserved_capacity + committed_capacity <= total_capacity)
);
CREATE UNIQUE INDEX IF NOT EXISTS capacity_seller_date_method_unique ON capacity_slots (seller_id, date_local, method);
CREATE INDEX IF NOT EXISTS capacity_date_method_idx ON capacity_slots (date_local, method);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY NOT NULL,
  order_number text NOT NULL,
  idempotency_key text NOT NULL,
  seller_id text NOT NULL REFERENCES sellers(id),
  product_id text NOT NULL REFERENCES products(id),
  capacity_slot_id text NOT NULL REFERENCES capacity_slots(id),
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  recipient_name text,
  recipient_phone text,
  recipient_address text,
  gift_message text,
  delivery_instructions text,
  commercial_status text NOT NULL,
  operational_status text NOT NULL,
  payment_status text NOT NULL,
  payout_status text NOT NULL,
  fulfilment_method text NOT NULL,
  requested_date_local text NOT NULL,
  timezone text DEFAULT 'Asia/Singapore' NOT NULL,
  window_label text NOT NULL,
  delivery_postcode text,
  quantity integer DEFAULT 1 NOT NULL,
  subtotal_cents integer NOT NULL,
  delivery_cents integer NOT NULL,
  platform_fee_cents integer DEFAULT 0 NOT NULL,
  tax_cents integer DEFAULT 0 NOT NULL,
  total_cents integer NOT NULL,
  commission_cents integer NOT NULL,
  seller_net_cents integer NOT NULL,
  product_snapshot_json text NOT NULL,
  fee_snapshot_json text NOT NULL,
  policy_snapshot_json text NOT NULL,
  payment_reference text NOT NULL,
  accept_by text NOT NULL,
  accepted_at text,
  completed_at text,
  version integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
  CONSTRAINT orders_subtotal_non_negative CHECK (subtotal_cents >= 0),
  CONSTRAINT orders_delivery_non_negative CHECK (delivery_cents >= 0),
  CONSTRAINT orders_total_non_negative CHECK (total_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique ON orders (order_number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique ON orders (idempotency_key);
CREATE INDEX IF NOT EXISTS orders_seller_status_idx ON orders (seller_id, operational_status);
CREATE INDEX IF NOT EXISTS orders_accept_by_idx ON orders (commercial_status, accept_by);

CREATE TABLE IF NOT EXISTS order_events (
  id text PRIMARY KEY NOT NULL,
  order_id text NOT NULL REFERENCES orders(id),
  actor_role text NOT NULL,
  event_type text NOT NULL,
  from_state text,
  to_state text,
  reason text,
  metadata_json text DEFAULT '{}' NOT NULL,
  idempotency_key text,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS order_events_order_created_idx ON order_events (order_id, created_at);
DROP INDEX IF EXISTS order_events_idempotency_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS order_events_order_idempotency_key_unique ON order_events (order_id, idempotency_key);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY NOT NULL,
  order_id text NOT NULL REFERENCES orders(id),
  sender_role text NOT NULL,
  sender_name text NOT NULL,
  body text NOT NULL,
  message_type text NOT NULL,
  read_at text,
  idempotency_key text,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT messages_body_not_empty CHECK (length(body) > 0)
);
CREATE INDEX IF NOT EXISTS messages_order_created_idx ON messages (order_id, created_at);
DROP INDEX IF EXISTS messages_idempotency_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS messages_order_idempotency_key_unique ON messages (order_id, idempotency_key);
`;

type SeedValue = string | number | null;

function insertIgnore(
  database: D1Database,
  table: string,
  record: Record<string, SeedValue>
): D1PreparedStatement {
  const entries = Object.entries(record);
  const columns = entries.map(([column]) => column).join(", ");
  const placeholders = entries.map(() => "?").join(", ");
  return database
    .prepare(`INSERT OR IGNORE INTO ${table} (${columns}) VALUES (${placeholders})`)
    .bind(...entries.map(([, value]) => value));
}

async function runBatches(database: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 40) {
    await database.batch(statements.slice(index, index + 40));
  }
}

const POLICY = {
  cancellation:
    "Free before seller acceptance. After acceptance, requests are reviewed against preparation progress.",
  substitution:
    "Seasonal stems may vary; material changes require your approval before the arrangement is marked ready.",
  freshness:
    "Report freshness, damage or incorrect-item concerns within 24 hours so support can help promptly.",
  sellerManagedDelivery:
    "Delivery is arranged and fulfilled by the florist within the selected window.",
};

const SELLER_SEEDS = [
  {
    id: "seller-petal-poem",
    slug: "petal-and-poem",
    trading_name: "Petal & Poem",
    legal_name: "Petal and Poem Studio",
    uen: "53481234P",
    seller_type: "home",
    status: "active",
    verification_status: "verified",
    psp_ready: 1,
    accepting_new_orders: 1,
    paused_until: null,
    gst_registered: 0,
    commission_bps: 1500,
    public_story:
      "A small-batch home floral studio composing airy, story-led arrangements with a distinctly modern Singapore sensibility.",
    public_area: "Tiong Bahru · Central Singapore",
    public_address: null,
    style_tags_json: JSON.stringify(["romantic", "garden", "pastel"]),
    fulfilment_methods_json: JSON.stringify(["delivery"]),
    response_sla_minutes: 60,
    default_lead_time_hours: 24,
    rating_hundredths: 492,
    review_count: 38,
  },
  {
    id: "seller-field-notes",
    slug: "field-notes-floral",
    trading_name: "Field Notes Floral",
    legal_name: "Field Notes Floral Pte. Ltd.",
    uen: "202618234N",
    seller_type: "studio",
    status: "active",
    verification_status: "verified",
    psp_ready: 1,
    accepting_new_orders: 1,
    paused_until: null,
    gst_registered: 1,
    commission_bps: 1400,
    public_story:
      "An appointment-based East Coast studio known for sculptural forms, native foliage and quietly unexpected colour.",
    public_area: "Joo Chiat · East Singapore",
    public_address: "Joo Chiat studio · appointment details after confirmation",
    style_tags_json: JSON.stringify(["sculptural", "wild", "modern"]),
    fulfilment_methods_json: JSON.stringify(["pickup", "delivery"]),
    response_sla_minutes: 60,
    default_lead_time_hours: 24,
    rating_hundredths: 487,
    review_count: 61,
  },
  {
    id: "seller-everlasting-room",
    slug: "the-everlasting-room",
    trading_name: "The Everlasting Room",
    legal_name: "The Everlasting Room LLP",
    uen: "T26LL0412H",
    seller_type: "store",
    status: "active",
    verification_status: "verified",
    psp_ready: 1,
    accepting_new_orders: 1,
    paused_until: null,
    gst_registered: 0,
    commission_bps: 1500,
    public_story:
      "A Serangoon neighbourhood florist balancing fresh seasonal stems with long-lasting dried and preserved pieces.",
    public_area: "Serangoon · North-East Singapore",
    public_address: "Demo storefront · Serangoon Central",
    style_tags_json: JSON.stringify(["earthy", "minimal", "bold"]),
    fulfilment_methods_json: JSON.stringify(["pickup", "delivery"]),
    response_sla_minutes: 60,
    default_lead_time_hours: 24,
    rating_hundredths: 479,
    review_count: 27,
  },
] as const;

const PRODUCT_SEEDS = [
  {
    id: "product-blush-peony",
    seller_id: "seller-petal-poem",
    slug: "blush-peony-study",
    title: "Blush Peony Study",
    description:
      "Cloud-soft blush peonies, sweet peas and seasonal dancing stems in an airy hand-tied bouquet.",
    status: "published",
    base_price_cents: 12800,
    occasion_tags_json: JSON.stringify(["anniversary", "romance", "birthday"]),
    style_tags_json: JSON.stringify(["romantic", "pastel", "garden"]),
    flower_tags_json: JSON.stringify(["peony", "sweet pea"]),
    image_url:
      "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=1200&q=85",
    image_alt: "Soft pink peony and seasonal flower bouquet",
    representative_photo_disclosure:
      "Each bouquet is made with the freshest available seasonal stems; the final composition keeps this palette and mood.",
    dimensions: "Approximately 40 cm tall · 28–32 cm wide",
    fulfilment_methods_json: JSON.stringify(["delivery"]),
    lead_time_hours: 24,
  },
  {
    id: "product-sunlit-ranunculus",
    seller_id: "seller-petal-poem",
    slug: "sunlit-ranunculus-posy",
    title: "Sunlit Ranunculus Posy",
    description:
      "Butter-yellow ranunculus, chamomile and textural foliage—a bright, generous gesture in a compact size.",
    status: "published",
    base_price_cents: 8600,
    occasion_tags_json: JSON.stringify(["birthday", "thank-you", "get-well"]),
    style_tags_json: JSON.stringify(["joyful", "garden", "bright"]),
    flower_tags_json: JSON.stringify(["ranunculus", "chamomile"]),
    image_url:
      "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=85",
    image_alt: "Warm yellow seasonal flower posy",
    representative_photo_disclosure:
      "Flower varieties may rotate with market quality while the yellow-and-cream palette remains consistent.",
    dimensions: "Approximately 32 cm tall · 24 cm wide",
    fulfilment_methods_json: JSON.stringify(["delivery"]),
    lead_time_hours: 24,
  },
  {
    id: "product-native-garden",
    seller_id: "seller-field-notes",
    slug: "native-garden-hand-tied",
    title: "Native Garden Hand-tied",
    description:
      "A loose, architectural bouquet of protea, dancing foliage and nuanced seasonal accents.",
    status: "published",
    base_price_cents: 10800,
    occasion_tags_json: JSON.stringify(["housewarming", "birthday", "congratulations"]),
    style_tags_json: JSON.stringify(["wild", "sculptural", "earthy"]),
    flower_tags_json: JSON.stringify(["protea", "eucalyptus"]),
    image_url:
      "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=85",
    image_alt: "Sculptural bouquet with protea and native foliage",
    representative_photo_disclosure:
      "Stem placement and supporting varieties are florist-led; silhouette, value and earthy character are preserved.",
    dimensions: "Approximately 50 cm tall · 38 cm wide",
    fulfilment_methods_json: JSON.stringify(["pickup", "delivery"]),
    lead_time_hours: 24,
  },
  {
    id: "product-orchid-architecture",
    seller_id: "seller-field-notes",
    slug: "white-orchid-architecture",
    title: "White Orchid Architecture",
    description:
      "Singapore orchids and clean tropical lines arranged as a calm, contemporary statement piece.",
    status: "published",
    base_price_cents: 14800,
    occasion_tags_json: JSON.stringify(["corporate", "new-home", "sympathy"]),
    style_tags_json: JSON.stringify(["minimal", "sculptural", "modern"]),
    flower_tags_json: JSON.stringify(["orchid", "anthurium"]),
    image_url:
      "https://images.unsplash.com/photo-1557968581-06d4b39ec1d2?auto=format&fit=crop&w=1200&q=85",
    image_alt: "Minimal white orchid arrangement",
    representative_photo_disclosure:
      "Orchid variety follows market quality; the white-green palette and architectural profile remain consistent.",
    dimensions: "Approximately 58 cm tall · 35 cm wide",
    fulfilment_methods_json: JSON.stringify(["pickup", "delivery"]),
    lead_time_hours: 48,
  },
  {
    id: "product-terracotta-keepsake",
    seller_id: "seller-everlasting-room",
    slug: "terracotta-keepsake",
    title: "Terracotta Keepsake",
    description:
      "Preserved hydrangea, palms and delicate grasses in warm clay tones, designed to live beautifully for months.",
    status: "published",
    base_price_cents: 9200,
    occasion_tags_json: JSON.stringify(["housewarming", "thank-you", "birthday"]),
    style_tags_json: JSON.stringify(["earthy", "lasting", "textural"]),
    flower_tags_json: JSON.stringify(["preserved hydrangea", "dried palm"]),
    image_url:
      "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1200&q=85",
    image_alt: "Warm terracotta dried and preserved arrangement",
    representative_photo_disclosure:
      "Preserved botanicals naturally vary in tone and shape; size, palette and overall value are matched.",
    dimensions: "Approximately 38 cm tall · 26 cm wide",
    fulfilment_methods_json: JSON.stringify(["pickup", "delivery"]),
    lead_time_hours: 12,
  },
  {
    id: "product-midnight-tulip",
    seller_id: "seller-everlasting-room",
    slug: "midnight-tulip-edit",
    title: "Midnight Tulip Edit",
    description:
      "Deep plum tulips and wine-toned seasonal flowers, wrapped with a restrained, fashion-forward finish.",
    status: "published",
    base_price_cents: 11800,
    occasion_tags_json: JSON.stringify(["romance", "birthday", "celebration"]),
    style_tags_json: JSON.stringify(["bold", "moody", "modern"]),
    flower_tags_json: JSON.stringify(["tulip", "seasonal foliage"]),
    image_url:
      "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1200&q=85",
    image_alt: "Moody plum and wine-coloured flower bouquet",
    representative_photo_disclosure:
      "Tulips are seasonal; an equivalent premium bloom may be proposed for approval if unavailable.",
    dimensions: "Approximately 42 cm tall · 30 cm wide",
    fulfilment_methods_json: JSON.stringify(["pickup", "delivery"]),
    lead_time_hours: 24,
  },
] as const;

const ZONE_SEEDS = [
  {
    id: "zone-petal-central",
    seller_id: "seller-petal-poem",
    name: "Central scheduled delivery",
    postal_sectors_json: JSON.stringify([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "14",
      "15",
      "16",
    ]),
    fee_cents: 1000,
    window_label: "2:00 pm–6:00 pm",
    enabled: 1,
  },
  {
    id: "zone-field-east",
    seller_id: "seller-field-notes",
    name: "East scheduled delivery",
    postal_sectors_json: JSON.stringify(["40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52"]),
    fee_cents: 900,
    window_label: "10:00 am–2:00 pm",
    enabled: 1,
  },
  {
    id: "zone-everlasting-islandwide",
    seller_id: "seller-everlasting-room",
    name: "Islandwide scheduled delivery",
    postal_sectors_json: JSON.stringify(["*"]),
    fee_cents: 1200,
    window_label: "2:00 pm–6:00 pm",
    enabled: 1,
  },
] as const;

function productById(id: string) {
  const product = PRODUCT_SEEDS.find((candidate) => candidate.id === id);
  if (!product) throw new Error(`Missing demo product ${id}`);
  return product;
}

function sellerById(id: string) {
  const seller = SELLER_SEEDS.find((candidate) => candidate.id === id);
  if (!seller) throw new Error(`Missing demo seller ${id}`);
  return seller;
}

function orderSeed(
  now: string,
  input: {
    id: string;
    orderNumber: string;
    productId: string;
    date: string;
    operationalStatus: "awaiting_acceptance" | "preparing" | "ready";
    paymentStatus: "authorised" | "captured";
    createdOffsetMinutes: number;
  }
): Record<string, SeedValue> {
  const product = productById(input.productId);
  const seller = sellerById(product.seller_id);
  const createdAt = addMinutesIso(now, input.createdOffsetMinutes);
  const deliveryCents = 1000;
  const commissionCents = Math.round((product.base_price_cents * seller.commission_bps) / 10_000);
  const confirmed = input.operationalStatus !== "awaiting_acceptance";
  const productSnapshot = {
    productId: product.id,
    slug: product.slug,
    title: product.title,
    imageUrl: product.image_url,
    quantity: 1,
    unitPriceCents: product.base_price_cents,
    sellerName: seller.trading_name,
    representativePhotoDisclosure: product.representative_photo_disclosure,
  };

  return {
    id: input.id,
    order_number: input.orderNumber,
    idempotency_key: `seed:${input.id}`,
    seller_id: seller.id,
    product_id: product.id,
    capacity_slot_id: `capacity:${seller.id}:${input.date}:delivery`,
    buyer_name: input.id === "order-demo-ready" ? "Mei Lin" : "Alex Tan",
    buyer_email: input.id === "order-demo-ready" ? "meilin@example.demo" : "alex@example.demo",
    recipient_name: input.id === "order-demo-preparing" ? "Jia Hui" : "Sam Lee",
    recipient_phone: "+65 •••• 2188",
    recipient_address: "Recipient address available to the fulfilling seller only",
    gift_message: input.id === "order-demo-ready" ? "You make every ordinary day brighter." : null,
    delivery_instructions: "Call recipient on arrival; please keep the arrangement upright.",
    commercial_status: confirmed ? "confirmed" : "awaiting_seller",
    operational_status: input.operationalStatus,
    payment_status: input.paymentStatus,
    payout_status: confirmed ? "payout_pending" : "not_started",
    fulfilment_method: "delivery",
    requested_date_local: input.date,
    timezone: "Asia/Singapore",
    window_label: "2:00 pm–6:00 pm",
    delivery_postcode: "160042",
    quantity: 1,
    subtotal_cents: product.base_price_cents,
    delivery_cents: deliveryCents,
    platform_fee_cents: 0,
    tax_cents: 0,
    total_cents: product.base_price_cents + deliveryCents,
    commission_cents: commissionCents,
    seller_net_cents: product.base_price_cents + deliveryCents - commissionCents,
    product_snapshot_json: JSON.stringify(productSnapshot),
    fee_snapshot_json: JSON.stringify({
      deliveryZone: "Central scheduled delivery",
      deliveryFeeCents: deliveryCents,
      commissionBps: seller.commission_bps,
      gstRegistered: Boolean(seller.gst_registered),
      capturedAtCheckout: createdAt,
    }),
    policy_snapshot_json: JSON.stringify(POLICY),
    payment_reference: `demo_auth_${input.orderNumber.toLowerCase().replaceAll("-", "_")}`,
    accept_by: addMinutesIso(createdAt, 60),
    accepted_at: confirmed ? addMinutesIso(createdAt, 18) : null,
    completed_at: null,
    version: 1,
    created_at: createdAt,
    updated_at: confirmed ? addMinutesIso(createdAt, 24) : createdAt,
  };
}

async function seed(database: D1Database) {
  const now = nowIso();
  const statements: D1PreparedStatement[] = [];

  for (const seller of SELLER_SEEDS) {
    statements.push(insertIgnore(database, "sellers", seller));
  }
  for (const zone of ZONE_SEEDS) {
    statements.push(insertIgnore(database, "delivery_zones", zone));
  }
  for (const product of PRODUCT_SEEDS) {
    statements.push(
      insertIgnore(database, "products", {
        ...product,
        currency: "SGD",
        policy_snapshot_json: JSON.stringify(POLICY),
        published_at: now,
      })
    );
  }

  const preparingDate = localDateFromNow(1);
  const awaitingDate = localDateFromNow(2);
  for (let day = 0; day <= 21; day += 1) {
    const date = localDateFromNow(day);
    for (const seller of SELLER_SEEDS) {
      const methods = JSON.parse(seller.fulfilment_methods_json) as Array<"pickup" | "delivery">;
      for (const method of methods) {
        const isPetalDelivery = seller.id === "seller-petal-poem" && method === "delivery";
        const committed = isPetalDelivery && date === preparingDate ? 2 : 0;
        const reserved = isPetalDelivery && date === awaitingDate ? 1 : 0;
        statements.push(
          insertIgnore(database, "capacity_slots", {
            id: `capacity:${seller.id}:${date}:${method}`,
            seller_id: seller.id,
            date_local: date,
            method,
            window_label:
              method === "pickup"
                ? "11:00 am–1:00 pm"
                : seller.id === "seller-field-notes"
                  ? "10:00 am–2:00 pm"
                  : "2:00 pm–6:00 pm",
            total_capacity: seller.id === "seller-petal-poem" ? 6 : 5,
            reserved_capacity: reserved,
            committed_capacity: committed,
            version: 1,
          })
        );
      }
    }
  }

  const seededOrders = [
    orderSeed(now, {
      id: "order-demo-awaiting",
      orderNumber: "FL-260713-1042",
      productId: "product-blush-peony",
      date: awaitingDate,
      operationalStatus: "awaiting_acceptance",
      paymentStatus: "authorised",
      createdOffsetMinutes: -38,
    }),
    orderSeed(now, {
      id: "order-demo-preparing",
      orderNumber: "FL-260713-1037",
      productId: "product-sunlit-ranunculus",
      date: preparingDate,
      operationalStatus: "preparing",
      paymentStatus: "captured",
      createdOffsetMinutes: -165,
    }),
    orderSeed(now, {
      id: "order-demo-ready",
      orderNumber: "FL-260713-1028",
      productId: "product-blush-peony",
      date: preparingDate,
      operationalStatus: "ready",
      paymentStatus: "captured",
      createdOffsetMinutes: -310,
    }),
  ];
  for (const order of seededOrders) {
    statements.push(insertIgnore(database, "orders", order));
  }

  const eventSeeds: Array<Record<string, SeedValue>> = [
    {
      id: "event-awaiting-created",
      order_id: "order-demo-awaiting",
      actor_role: "system",
      event_type: "order.awaiting_acceptance",
      from_state: null,
      to_state: "awaiting_acceptance",
      reason: "Payment authorised; awaiting florist confirmation.",
      metadata_json: JSON.stringify({ paymentSimulation: true }),
      idempotency_key: "seed:event-awaiting-created",
      created_at: addMinutesIso(now, -38),
    },
    {
      id: "event-preparing-accepted",
      order_id: "order-demo-preparing",
      actor_role: "seller",
      event_type: "order.accepted",
      from_state: "awaiting_acceptance",
      to_state: "accepted",
      reason: null,
      metadata_json: JSON.stringify({ paymentCapture: "simulated" }),
      idempotency_key: "seed:event-preparing-accepted",
      created_at: addMinutesIso(now, -147),
    },
    {
      id: "event-preparing-started",
      order_id: "order-demo-preparing",
      actor_role: "seller",
      event_type: "production.preparing",
      from_state: "accepted",
      to_state: "preparing",
      reason: null,
      metadata_json: "{}",
      idempotency_key: "seed:event-preparing-started",
      created_at: addMinutesIso(now, -141),
    },
    {
      id: "event-ready",
      order_id: "order-demo-ready",
      actor_role: "seller",
      event_type: "fulfilment.ready",
      from_state: "preparing",
      to_state: "ready",
      reason: null,
      metadata_json: JSON.stringify({ next: "seller_courier_handoff" }),
      idempotency_key: "seed:event-ready",
      created_at: addMinutesIso(now, -42),
    },
  ];
  for (const event of eventSeeds) {
    statements.push(insertIgnore(database, "order_events", event));
  }

  const messageSeeds: Array<Record<string, SeedValue>> = [
    {
      id: "message-awaiting-buyer",
      order_id: "order-demo-awaiting",
      sender_role: "buyer",
      sender_name: "Alex",
      body: "Hello! Soft blush tones would be perfect—please avoid anything strongly scented.",
      message_type: "message",
      read_at: null,
      idempotency_key: "seed:message-awaiting-buyer",
      created_at: addMinutesIso(now, -31),
    },
    {
      id: "message-preparing-seller",
      order_id: "order-demo-preparing",
      sender_role: "seller",
      sender_name: "Petal & Poem",
      body: "Your flowers are on the workbench now. We’ll update you when the bouquet is ready for our courier.",
      message_type: "message",
      read_at: addMinutesIso(now, -109),
      idempotency_key: "seed:message-preparing-seller",
      created_at: addMinutesIso(now, -132),
    },
    {
      id: "message-ready-system",
      order_id: "order-demo-ready",
      sender_role: "system",
      sender_name: "Florist Platform",
      body: "The arrangement is ready. The florist’s delivery partner will collect it shortly.",
      message_type: "system",
      read_at: null,
      idempotency_key: "seed:message-ready-system",
      created_at: addMinutesIso(now, -42),
    },
  ];
  for (const message of messageSeeds) {
    statements.push(insertIgnore(database, "messages", message));
  }

  await runBatches(database, statements);
}

let initialization: Promise<D1Database> | undefined;

/** Creates a fresh preview database and seeds it once without overwriting demo edits. */
export function ensureDemoDatabase(): Promise<D1Database> {
  if (!initialization) {
    initialization = (async () => {
      const database = getD1Binding();
      const schemaStatements = RUNTIME_SCHEMA_SQL.split(";")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => database.prepare(statement));
      await runBatches(database, schemaStatements);
      await seed(database);
      return database;
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }

  return initialization;
}
