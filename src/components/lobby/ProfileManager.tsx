"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useProfiles } from "@/hooks/useProfiles";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function ProfileManager() {
  const { data: session } = useSession();
  const { profiles, loading, createProfile, removeProfile } = useProfiles();
  const myEmail = session?.user?.email?.toLowerCase();
  const sortedProfiles = [...profiles].sort((a, b) =>
    a.email === myEmail ? -1 : b.email === myEmail ? 1 : 0
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      await createProfile(name, email);
      setName("");
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {loading && <p className="text-ink-muted">Loading…</p>}
        {!loading && profiles.length === 0 && (
          <p className="text-ink-muted">No players yet — add one below.</p>
        )}
        {sortedProfiles.map((p) => {
          const isMe = p.email === myEmail;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {p.name}
                  {isMe && <span className="text-ink-muted"> (you)</span>}
                </p>
                <p className="truncate text-xs text-ink-muted">{p.email}</p>
              </div>
              {!isMe && (
                <button
                  onClick={() => removeProfile(p.id).catch(() => setError("Could not remove player"))}
                  className="shrink-0 text-xs font-semibold text-ink-muted underline"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-ink-muted">Add a player</p>
        <Input placeholder="Name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p className="text-sm text-accent">{error}</p>}
        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={saving || !name.trim() || !email.trim()}
        >
          {saving ? "Adding…" : "Add player"}
        </Button>
      </div>
    </div>
  );
}
