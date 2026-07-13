import type { Metadata } from "next";
import { AdminConsoleApp } from "../components/AdminConsoleApp";

export const metadata: Metadata = {
  title: "Marketplace operations",
  description: "Closed-beta seller review, exceptions, and audit timeline.",
};

export default function AdminPage() {
  return <AdminConsoleApp />;
}
