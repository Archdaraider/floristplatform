import type { Metadata } from "next";
import { SellerDashboardApp } from "../components/SellerDashboardApp";

export const metadata: Metadata = {
  title: "Seller studio",
  description: "Mobile-first florist order, capacity, and catalogue operations.",
};

export default function SellerPage() {
  return <SellerDashboardApp />;
}
