import { notFound } from "next/navigation";
import TestModeView from "@/components/test/TestModeView";

// Dev-only harness for exercising the board/engine without a server, a
// room, or real players — see src/components/test/TestModeView.tsx.
export default function TestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <TestModeView />;
}
