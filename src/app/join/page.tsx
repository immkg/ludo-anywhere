import { Suspense } from "react";
import JoinRoom from "@/components/lobby/JoinRoom";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinRoom />
    </Suspense>
  );
}
