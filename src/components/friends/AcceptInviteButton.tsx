"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/friends/invite/${token}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add friend");
      router.push("/friends");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add friend");
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {error && <p className="text-sm text-accent">{error}</p>}
      <Button onClick={handleAccept} disabled={loading}>
        {loading ? "Adding…" : "Add friend"}
      </Button>
    </div>
  );
}
