import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about playing MyLudo — devices, accounts, pricing, and ads.",
  alternates: { canonical: "/faq" },
};

// Keep this list as the single source of truth — the JSON-LD below quotes
// these exact strings, and search engines penalize FAQPage schema whose
// text doesn't match what's actually rendered on the page.
const FAQS = [
  {
    question: "Does MyLudo have ads?",
    answer:
      "No. MyLudo has no ads and never will. The only monetization is a free daily allowance plus optional paid Game Packs and subscriptions for unlimited play.",
  },
  {
    question: "Do I need to install anything to play?",
    answer:
      "No. MyLudo runs entirely in your browser, on any phone, tablet, or computer. If you'd like a home-screen icon, your browser can install it as an app — but that's completely optional.",
  },
  {
    question: "Do I need an account to play?",
    answer:
      "No. You can create or join a room as a guest. Signing in with Google is optional — it just saves your players, stats, and friends across visits.",
  },
  {
    question: "Can players join from different types of devices?",
    answer:
      "Yes. Some players can share one device while others join from their own phone, tablet, or computer, all in the same room.",
  },
  {
    question: "How many players can play at once?",
    answer: "Rooms support 2 to 4 players.",
  },
  {
    question: "Is MyLudo free?",
    answer:
      "Yes, to start. Everyone gets a free daily allowance of games. Beyond that, a Game Pack or subscription unlocks unlimited play — see the Pricing page for current rates.",
  },
  {
    question: "Are my rooms private?",
    answer:
      "Yes. A room is only reachable by whoever has its code or link — it isn't listed or searchable.",
  },
  {
    question: "What happens if I lose connection mid-game?",
    answer:
      "You can rejoin the same room and pick up your seat where you left off.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function FaqPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Frequently Asked Questions
        </h1>
      </div>

      <dl className="flex flex-col gap-4">
        {FAQS.map((faq) => (
          <div
            key={faq.question}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <dt className="text-sm font-bold text-ink">{faq.question}</dt>
            <dd className="mt-1 text-sm text-ink-muted">{faq.answer}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-ink-muted">
        More about the product on the{" "}
        <Link href="/about" className="text-accent hover:underline">
          About
        </Link>{" "}
        page.
      </p>
    </MarketingShell>
  );
}
