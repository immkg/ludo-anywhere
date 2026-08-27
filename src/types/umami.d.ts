export {};

declare global {
  interface Window {
    // Only present once the tracker script (src/app/layout.tsx) has
    // loaded — production only, so this is undefined in local dev.
    umami?: {
      identify: (data: Record<string, unknown>) => void;
    };
  }
}
