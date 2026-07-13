import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { incomingSiteOrigin } from "@/lib/site-url";
import { PwaRegister } from "./components/PwaRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export async function generateMetadata(): Promise<Metadata> {
  const origin = await incomingSiteOrigin();
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: origin,
    title: {
      default: "Petalfolk — Flowers from independent Singapore florists",
      template: "%s — Petalfolk",
    },
    description:
      "A closed-beta marketplace prototype for independent Singapore florists, with real availability, pickup, and seller-managed delivery.",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      locale: "en_SG",
      title: "Petalfolk — Flowers from independent Singapore florists",
      description:
        "A closed-beta marketplace prototype with real availability, pickup, and seller-managed delivery.",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Petalfolk florist marketplace preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Petalfolk — Flowers from independent Singapore florists",
      description:
        "A closed-beta marketplace prototype with real availability, pickup, and seller-managed delivery.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-SG">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      >
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
        <PwaRegister />
      </body>
    </html>
  );
}
