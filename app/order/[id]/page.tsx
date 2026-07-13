import type { Metadata } from "next";
import { OrderTrackerApp } from "../../components/OrderTrackerApp";

export const metadata: Metadata = {
  title: "Order tracking",
  description: "Track florist confirmation, preparation, and fulfilment.",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderTrackerApp orderId={id} />;
}
