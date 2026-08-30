export function shareOnWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// Opens the OS share sheet (any installed app — WhatsApp, SMS, Messenger,
// etc.), which is what mobile browsers support; falls back to the WhatsApp
// deep link where the Web Share API isn't available (most desktop browsers).
export async function shareText(text: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // user dismissed the sheet
    }
  }
  shareOnWhatsApp(text);
}

export function roomJoinUrl(roomCode: string) {
  return `${window.location.origin}/join?code=${roomCode}`;
}

export type ShareResult = "shared" | "copied";

// Sharing a room-join link specifically: the OS share sheet when
// available; otherwise there's no single "right" app to fall back to
// (unlike a generic WhatsApp deep link), so it copies the join link
// itself to the clipboard — pasteable anywhere. Caller shows its own
// "Copied!" feedback based on the result.
export async function shareRoomLink(message: string, url: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text: message });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared"; // user dismissed the sheet
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
