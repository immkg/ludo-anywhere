"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { signIn } from "next-auth/react";
import posthog from "posthog-js";
import Button from "@/components/ui/Button";

type SignInTeaserProps = {
  title: string;
  subtitle: string;
  source: string;
};

// Stands in for a gated page's real content when there's no session — the
// page itself (nav, headings, layout) still renders normally, only the
// data-backed part is replaced by this. `source` tags which page prompted
// the sign-in, so the funnel shows which gate actually converts.
export default function SignInTeaser({ title, subtitle, source }: SignInTeaserProps) {
  const pathname = usePathname();

  useEffect(() => {
    posthog.capture("signup_prompted", { source });
  }, [source]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-line p-8 text-center">
      <p className="text-lg font-extrabold text-ink">{title}</p>
      <p className="max-w-[36ch] text-sm text-ink-muted">{subtitle}</p>
      <Button
        icon={
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/icon-google.png" alt="" className="h-full w-full" />
        }
        onClick={() => {
          posthog.capture("signup_prompted_clicked", { source });
          signIn("google", { callbackUrl: pathname !== "/" ? pathname : undefined });
        }}
      >
        Continue with Google
      </Button>
    </div>
  );
}
