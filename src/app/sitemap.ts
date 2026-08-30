import type { MetadataRoute } from "next";

const SITE_URL = "https://www.myludo.life";

// /privacy and /terms are deliberately excluded — they're marked noindex in
// their own metadata, and a noindex URL in the sitemap is a Search Console
// warning, not a helpful signal.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/about", priority: 0.6 },
    { path: "/cross-device-ludo", priority: 0.7 },
    { path: "/how-to-play", priority: 0.6 },
    { path: "/ludo-rules", priority: 0.6 },
    { path: "/faq", priority: 0.6 },
  ];

  return staticPages.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority,
  }));
}
