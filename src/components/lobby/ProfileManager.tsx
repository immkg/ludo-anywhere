"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useProfiles } from "@/hooks/useProfiles";
import type { PlayerProfile } from "@/types/profile";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PlayerAvatar from "@/components/lobby/PlayerAvatar";
import { IconPlus, IconTrophy } from "@/components/lobby/icons";
import { IconPerson } from "@/components/home/icons";
import { RED } from "@/components/nav/navItems";

export default function ProfileManager() {
  const { data: session } = useSession();
  const { profiles, loading, createProfile, removeProfile, renameProfile } = useProfiles();
  const myEmail = session?.user?.email?.toLowerCase();
  const myImage = session?.user?.image ?? null;

  const meProfile = profiles.find((p) => p.email === myEmail) ?? null;
  const otherProfiles = [...profiles]
    .filter((p) => p.email !== myEmail)
    .sort((a, b) => a.name.localeCompare(b.name));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const startEditing = (p: PlayerProfile) => {
    setEditingId(p.id);
    setEditName(p.name);
    setRenameError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setRenameError(null);
  };

  const handleRename = async (profileId: string) => {
    setRenaming(true);
    setRenameError(null);
    try {
      await renameProfile(profileId, editName);
      cancelEditing();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not rename player");
    } finally {
      setRenaming(false);
    }
  };

  const handleRemove = async (profileId: string) => {
    setRemovingId(profileId);
    setRemoveError(null);
    try {
      await removeProfile(profileId);
      setConfirmRemoveId(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Could not remove player");
    } finally {
      setRemovingId(null);
    }
  };

  const openAddForm = () => {
    setShowAddForm(true);
    setAddError(null);
    setNotice(null);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setName("");
    setEmail("");
    setAddError(null);
  };

  const handleAdd = async () => {
    setSaving(true);
    setAddError(null);
    const existingIds = new Set(profiles.map((p) => p.id));
    try {
      const profile = await createProfile(name, email);
      if (existingIds.has(profile.id)) {
        setNotice(
          profile.email === myEmail
            ? "That's you — already listed above."
            : `${profile.name} is already in your players.`
        );
      } else {
        setNotice(null);
      }
      setName("");
      setEmail("");
      setShowAddForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setSaving(false);
    }
  };

  const renderRenameEditor = (profile: PlayerProfile) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`rename-${profile.id}`} className="text-xs font-semibold text-ink-muted">
        Rename player
      </label>
      <Input
        id={`rename-${profile.id}`}
        autoFocus
        value={editName}
        maxLength={20}
        onChange={(e) => setEditName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancelEditing();
        }}
      />
      {renameError && <p className="text-sm text-accent">{renameError}</p>}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="min-h-9 px-3 text-xs"
          onClick={() => handleRename(profile.id)}
          disabled={renaming || !editName.trim()}
        >
          {renaming ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={cancelEditing} disabled={renaming}>
          Cancel
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface-2/60 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <IconPerson className="h-5 w-5" />
        </span>
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">Your Google account signs you into MyLudo.</span>{" "}
          Players are the people who sit at the table.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-extrabold text-ink sm:text-lg">Your player</h2>
          <p className="text-xs text-ink-muted sm:text-sm">Created automatically when you signed in.</p>
        </div>
        {meProfile ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <PlayerAvatar name={meProfile.name} email={meProfile.email} image={myImage} size="md" />
            <div className="min-w-0 flex-1">
              {editingId === meProfile.id ? (
                renderRenameEditor(meProfile)
              ) : (
                <>
                  <p className="truncate text-base font-bold text-ink">{meProfile.name}</p>
                  <p className="truncate text-sm text-ink-muted">{meProfile.email}</p>
                  <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-bold tracking-wide text-accent">
                    YOU
                  </span>
                </>
              )}
            </div>
            {editingId !== meProfile.id && (
              <button
                onClick={() => startEditing(meProfile)}
                className="min-h-11 shrink-0 rounded-full px-2 text-xs font-semibold text-ink-muted underline hover:text-ink"
              >
                Rename
              </button>
            )}
          </div>
        ) : (
          <div className="h-20 animate-pulse rounded-2xl bg-surface-2" />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-extrabold text-ink sm:text-lg">Other players</h2>
          <p className="text-xs text-ink-muted sm:text-sm">
            {otherProfiles.length > 0
              ? "People who play from your devices."
              : "Add family or friends who play on your devices."}
          </p>
        </div>

        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-muted">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 text-xs font-semibold underline hover:text-ink">
              Dismiss
            </button>
          </div>
        )}

        {removeError && <p className="text-sm text-accent">{removeError}</p>}

        {otherProfiles.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">You&apos;re the only player so far.</p>
            <p className="mt-1 text-sm text-ink-muted">Add family or friends who play on this device.</p>
          </div>
        )}

        {otherProfiles.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {otherProfiles.map((p) => {
              const isEditing = editingId === p.id;
              const isConfirming = confirmRemoveId === p.id;
              const isRemoving = removingId === p.id;

              if (isConfirming) {
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
                  >
                    <PlayerAvatar name={p.name} email={p.email} size="sm" />
                    <p className="min-w-0 flex-1 text-sm text-ink-muted">
                      Remove {p.name}? They won&apos;t appear when choosing players for a room.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="min-h-11 rounded-full px-3 text-xs font-semibold text-ink-muted underline"
                      >
                        Keep player
                      </button>
                      <button
                        disabled={isRemoving}
                        onClick={() => handleRemove(p.id)}
                        style={{ borderColor: `${RED}4d`, backgroundColor: `${RED}1a`, color: RED }}
                        className="min-h-11 rounded-full border px-3 text-xs font-semibold disabled:opacity-40"
                      >
                        {isRemoving ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
                >
                  <PlayerAvatar name={p.name} email={p.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      renderRenameEditor(p)
                    ) : (
                      <>
                        <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                        <p className="truncate text-xs text-ink-muted">{p.email}</p>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex shrink-0 gap-4">
                      <button
                        onClick={() => startEditing(p)}
                        className="min-h-11 text-xs font-semibold text-ink-muted underline hover:text-ink"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          setConfirmRemoveId(p.id);
                          setRemoveError(null);
                        }}
                        className="min-h-11 text-xs font-semibold text-ink-muted underline hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!showAddForm ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line bg-surface/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <IconPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">Add a player</p>
                <p className="truncate text-xs text-ink-muted">Add someone who plays on your devices.</p>
              </div>
            </div>
            <Button variant="primary" className="min-h-11 w-full shrink-0 px-4 text-sm sm:w-auto" onClick={openAddForm}>
              <span className="flex items-center justify-center gap-1.5">
                <IconPlus className="h-4 w-4" /> Add player
              </span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <div>
              <p className="text-sm font-bold text-ink">Add a player</p>
              <p className="text-xs text-ink-muted">Add someone who plays on your devices.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-player-name" className="text-xs font-semibold text-ink-muted">
                Name
              </label>
              <Input
                id="add-player-name"
                autoFocus
                placeholder="Name"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-player-email" className="text-xs font-semibold text-ink-muted">
                Email
              </label>
              <Input
                id="add-player-email"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-ink-muted">Used to recognize this player across devices.</p>
            </div>
            {addError && <p className="text-sm text-accent">{addError}</p>}
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleAdd} disabled={saving || !name.trim() || !email.trim()}>
                {saving ? "Adding…" : "Add player"}
              </Button>
              <Button variant="ghost" onClick={closeAddForm} disabled={saving}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              This player can be selected from any signed-in device using this email.
            </p>
          </div>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-2/20 text-accent-2">
          <IconTrophy className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-ink">One player, one history.</p>
          <p className="text-xs text-ink-muted">
            Your players keep their games and leaderboard stats wherever they play.
          </p>
        </div>
      </div>
    </div>
  );
}
