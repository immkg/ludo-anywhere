import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyLudo — Play Ludo Online with Friends",
    short_name: "MyLudo",
    description: "Create a room or join one and play Ludo with friends, on any device.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf6ef",
    theme_color: "#fbf6ef",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
