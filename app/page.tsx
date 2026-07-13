import type { Metadata } from "next";
import { ConsumerMarketplace } from "./components/ConsumerMarketplace";

export const metadata: Metadata = {
  title: "Independent Singapore florists",
  description:
    "Find flowers that are genuinely available for your date, postcode, and preferred fulfilment method.",
};

export default function Home() {
  return <ConsumerMarketplace />;
}
