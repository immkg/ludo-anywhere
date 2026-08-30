import Link from "next/link";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/cross-device-ludo", label: "Cross-Device Play" },
  { href: "/how-to-play", label: "How to Play" },
  { href: "/ludo-rules", label: "Ludo Rules" },
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function MarketingFooter() {
  return (
    <footer className="mx-auto mt-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-10">
      <nav
        className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted"
        aria-label="More about MyLudo"
      >
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-ink">
            {link.label}
          </Link>
        ))}
        <a
          href="https://github.com/immkg/ludo-anywhere"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink"
        >
          GitHub
        </a>
      </nav>
      <p className="mt-3 text-xs text-ink-muted">
        © {new Date().getFullYear()} MyLudo. No ads, ever.
      </p>
    </footer>
  );
}
