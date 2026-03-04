import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Manga Blast",
    short_name: "MangaBlast",
    description: "Cozy mobile-first manga reader with offline support",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1612",
    theme_color: "#1a1612",
    orientation: "portrait",
    icons: [
      { src: "/icons/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
