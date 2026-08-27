"use client";

import type { ReactNode } from "react";
import { useSocketConnection } from "@/hooks/useSocket";
import RoomInviteBanner from "@/components/friends/RoomInviteBanner";

export default function SocketProvider({ children }: { children: ReactNode }) {
  useSocketConnection();
  return (
    <>
      <RoomInviteBanner />
      {children}
    </>
  );
}
