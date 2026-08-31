const SITE_URL = "https://www.myludo.life";
const GITHUB_URL = "https://github.com/immkg/ludo-anywhere";

// Rendered once in the root layout. Kept to only what the site's visible
// content actually backs — WebApplication + Organization facts that are
// true on every page — never per-page claims (those schemas live next to
// the page that makes the claim, e.g. FAQPage on /faq).
const GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "MyLudo",
      url: SITE_URL,
      applicationCategory: "GameApplication",
      operatingSystem: "Any (web browser)",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Play Ludo online with 2 to 4 players across any mix of devices — no install required, no ads.",
    },
    {
      "@type": "Organization",
      name: "MyLudo",
      url: SITE_URL,
      sameAs: [GITHUB_URL],
    },
  ],
};

export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(GRAPH) }}
    />
  );
}
