"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useProfiles } from "@/hooks/useProfiles";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function ProfileManager() {
  const { data: session } = useSession();
  const { profiles, loading, createProfile, removeProfile, renameProfile } = useProfiles();
  const myEmail = session?.user?.email?.toLowerCase();
  const sortedProfiles = [...profiles].sort((a, b) =>
    a.email === myEmail ? -1 : b.email === myEmail ? 1 : 0
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

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

  const startEditing = (p: { id: string; name: string }) => {
    setEditingId(p.id);
    setEditName(p.name);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleRename = async (profileId: string) => {
    setRenaming(true);
    setError(null);
    try {
      await renameProfile(profileId, editName);
      cancelEditing();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename player");
    } finally {
      setRenaming(false);
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
          const isEditing = editingId === p.id;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      autoFocus
                      value={editName}
                      maxLength={20}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-9 px-3 text-xs"
                        onClick={() => handleRename(p.id)}
                        disabled={renaming || !editName.trim()}
                      >
                        {renaming ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-9 px-3 text-xs"
                        onClick={cancelEditing}
                        disabled={renaming}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold">
                      {p.name}
                      {isMe && <span className="text-ink-muted"> (you)</span>}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{p.email}</p>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex shrink-0 gap-3">
                  <button
                    onClick={() => startEditing(p)}
                    className="text-xs font-semibold text-ink-muted underline"
                  >
                    Rename
                  </button>
                  {!isMe && (
                    <button
                      onClick={() => removeProfile(p.id).catch(() => setError("Could not remove player"))}
                      className="text-xs font-semibold text-ink-muted underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
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
