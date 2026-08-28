// Small inline line-icon set for the pricing screen — matches the same
// hand-rolled stroke style already used in src/components/lobby/icons.tsx
// and src/components/home/icons.tsx (no icon library dependency in this
// repo). IconCrown/IconCheck/IconUsers already exist in lobby/icons.tsx and
// IconLightning in home/icons.tsx — reused from there instead of duplicated.

type IconProps = { className?: string };

const base = "h-full w-full";

export function IconSprout({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <path d="M12 21v-9" />
      <path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6Z" />
      <path d="M12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" />
    </svg>
  );
}

export function IconGift({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 13h18" />
      <path d="M12 9v12" />
      <path d="M12 9C9 9 7.5 7.5 7.5 6A2.5 2.5 0 0 1 12 4.5 2.5 2.5 0 0 1 16.5 6c0 1.5-1.5 3-4.5 3Z" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
