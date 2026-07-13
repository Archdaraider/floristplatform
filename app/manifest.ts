import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Petalfolk Singapore Florist Marketplace",
    short_name: "Petalfolk",
    description:
      "Find genuinely available arrangements from independent Singapore florists.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F1E9",
    theme_color: "#24211E",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Shop flowers",
        short_name: "Consumer",
        url: "/",
      },
      {
        name: "Seller studio",
        short_name: "Seller",
        url: "/seller",
      },
    ],
  };
}
