import type { Metadata } from "next";
import { SellerDashboardApp } from "../components/SellerDashboardApp";

export const metadata: Metadata = {
  title: "Seller studio",
  description: "Mobile-first florist order, capacity, and catalogue operations.",
};

export default async function SellerPage({
  searchParams,
}: {
  searchParams: Promise<{ sellerId?: string | string[]; orderId?: string | string[] }>;
}) {
  const query = await searchParams;
  const initialSellerId = Array.isArray(query.sellerId)
    ? query.sellerId[0]
    : query.sellerId;
  const initialOrderId = Array.isArray(query.orderId)
    ? query.orderId[0]
    : query.orderId;
  return (
    <SellerDashboardApp
      key={`${initialSellerId ?? "seller-petal-poem"}:${initialOrderId ?? ""}`}
      initialSellerId={initialSellerId}
      initialOrderId={initialOrderId}
    />
  );
}
