"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

// Ties this browser's Umami session to the same id server-side events use
// (src/server/umami.js) — see docs.umami.is/docs/guides/identify-logged-in-users.
// Runs once per login (the effect only re-fires if the id itself changes),
// not on every page — that's the documented calling convention.
function UmamiIdentify() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) window.umami?.identify({ id: userId });
  }, [userId]);

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <UmamiIdentify />
      {children}
    </SessionProvider>
  );
}
