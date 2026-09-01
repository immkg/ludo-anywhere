"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { sendSpectatorChat } from "@/lib/socketActions";
import type { SpectatorChatMessage } from "@/types/room";

// A floating, collapsible side channel for spectators to talk among
// themselves — deliberately its own widget (not a card wedged into
// WaitingRoom/GameView's existing layout) so it reads as visually and
// structurally distinct from the players' own reaction/quick-chat stream
// (ReactionBar/game:reaction). Only ever rendered for a confirmed
// spectator (see RoomPageClient.tsx) — there's no host/player view of this
// at all, matching the spectator model's privacy invariant that watchers'
// identities never reach anyone but the host, and even then only
// transiently at approval time (see SpectateSettings.tsx).
const MESSAGE_MAX_LENGTH = 240;

export default function SpectatorChat({ roomCode, spectatorId }: { roomCode: string; spectatorId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SpectatorChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(open);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  // spectator:chat:history arrives once, right after this device's socket
  // joins the spectator channel (see room:watch in server.js) — a bounded
  // backlog so joining mid-conversation isn't a blank screen.
  // spectator:chat:message is every message after that, this device's own
  // included (unlike game:reaction, the sender doesn't show it locally
  // first — waiting for the same broadcast everyone else gets keeps this
  // one code path instead of two).
  useEffect(() => {
    const socket = getSocket();
    const onHistory = ({ messages: history }: { messages: SpectatorChatMessage[] }) => setMessages(history);
    const onMessage = (message: SpectatorChatMessage) => {
      setMessages((prev) => [...prev, message]);
      if (!openRef.current) setUnread((u) => u + 1);
    };
    socket.on("spectator:chat:history", onHistory);
    socket.on("spectator:chat:message", onMessage);
    return () => {
      socket.off("spectator:chat:history", onHistory);
      socket.off("spectator:chat:message", onMessage);
    };
  }, [roomCode]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendSpectatorChat(roomCode, trimmed);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message");
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open spectator chat"
        className="fixed bottom-4 right-4 z-30 flex h-12 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink shadow-lg"
      >
        <span aria-hidden>💬</span> Spectator chat
        {unread > 0 && (
          <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-h-[60vh] w-auto max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl sm:inset-x-auto sm:right-4">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <p className="text-sm font-bold text-ink">
          <span aria-hidden>💬</span> Spectator chat
        </p>
        <button onClick={() => setOpen(false)} className="text-sm font-semibold text-ink-muted underline">
          Close
        </button>
      </div>

      <div ref={listRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-ink-muted">No messages yet — say hello to the other watchers.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.fromId === spectatorId ? "self-end text-right" : "self-start text-left"}>
              <p className="text-[11px] font-semibold text-ink-muted">{m.fromId === spectatorId ? "You" : m.fromName}</p>
              <p
                className={
                  "inline-block max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm " +
                  (m.fromId === spectatorId ? "bg-accent text-white" : "bg-surface-2 text-ink")
                }
              >
                {m.text}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-line p-2">
        {error && <p className="px-1 text-xs text-accent">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            value={text}
            maxLength={MESSAGE_MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Message other watchers…"
            className="min-h-10 w-full flex-1 rounded-full border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="shrink-0 rounded-full bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
