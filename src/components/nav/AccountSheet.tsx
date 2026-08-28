"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { signOut } from "next-auth/react";
import CreditBalance from "@/components/nav/CreditBalance";
import NavigationItem from "@/components/nav/NavigationItem";
import { NAV_ITEMS, IconExit } from "@/components/nav/navItems";

type AccountSheetProps = {
  open: boolean;
  onClose: () => void;
  displayName: string;
  email: string | null;
  userImage: string | null;
};

// A hand-rolled bottom sheet (no dialog/modal library in this repo) —
// backdrop click, Escape, and a focus trap all done directly here. Sign
// out uses next-auth/react's signOut() exactly as the old AccountBar did;
// nothing about the auth flow itself changes.
export default function AccountSheet({ open, onClose, displayName, email, userImage }: AccountSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    const sheet = sheetRef.current;
    const focusable = sheet?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : undefined}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Account menu"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-4 overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden />

            <div className="flex items-center gap-3">
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userImage} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-full" />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded-full bg-surface-2" />
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-ink">{displayName}</p>
                {email && <p className="truncate text-sm text-ink-muted">{email}</p>}
              </div>
            </div>

            <CreditBalance />

            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <NavigationItem key={item.href} {...item} onNavigate={onClose} />
              ))}
            </nav>

            <div className="border-t border-line pt-3">
              <button
                onClick={() => signOut()}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-[#E8262C]/10"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8262C]/10 text-[#E8262C]">
                  <IconExit className="h-4 w-4" />
                </span>
                Sign out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
