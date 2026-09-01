// The fixed set of preset phrases quick-chat can send — deliberately not
// free text (no chat infra exists in this codebase at all — see the PR
// this shipped in). Every phrasing a player can possibly send is
// enumerated here, both for the picker's own button list (see
// ReactionPicker.tsx) and as the server's allowlist (see game:reaction in
// server.js), so a hand-crafted client can't smuggle arbitrary text
// through the same event a sticker/emoji reaction uses. No moderation
// system is needed as a result — every possible message is already
// reviewed, once, right here.
export const QUICK_CHAT_PHRASES = [
  "Good luck!",
  "Nice roll!",
  "Nice move!",
  "So close!",
  "Oops!",
  "Unlucky!",
  "Hurry up!",
  "GG",
];

export function isQuickChatPhrase(text) {
  return QUICK_CHAT_PHRASES.includes(text);
}
