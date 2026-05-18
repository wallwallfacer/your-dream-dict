import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/basePath";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dream Dict",
    short_name: "Dream Dict",
    description: "An AI dictionary that explains words like a friend would.",
    start_url: withBasePath("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8e7",
    theme_color: "#fff8e7",
    icons: [
      {
        src: withBasePath("/icon-192.svg"),
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: withBasePath("/icon-512.svg"),
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
