// Plain data, deliberately NOT in a "use client" file: a server component
// (history/page.tsx) needs the real array to validate the `range` search
// param, and importing a named export out of a "use client" module gives a
// server component a client-reference proxy instead of the value.
export const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
