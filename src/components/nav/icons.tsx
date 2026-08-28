// Small inline line-icon set for the account navigation (sheet/sidebar) —
// matches the same hand-rolled stroke style already used in
// src/components/lobby/icons.tsx and src/components/home/icons.tsx.

type IconProps = { className?: string };

const base = "h-full w-full";

export function IconMenu({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="m12 2 2.9 6.3 6.8.7-5.1 4.6 1.5 6.7L12 16.9l-6.1 3.4 1.5-6.7-5.1-4.6 6.8-.7L12 2Z" />
    </svg>
  );
}
