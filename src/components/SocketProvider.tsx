"use client";

import type { ReactNode } from "react";
import { useSocketConnection } from "@/hooks/useSocket";

export default function SocketProvider({ children }: { children: ReactNode }) {
  useSocketConnection();
  return <>{children}</>;
}
