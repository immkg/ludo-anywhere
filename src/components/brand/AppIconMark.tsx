import { cn } from "@/lib/utils";

export default function AppIconMark({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/icon-mark.png"
        alt="MyLudo"
        className={cn("dark:hidden", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/icon-mark-dark.png"
        alt="MyLudo"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
