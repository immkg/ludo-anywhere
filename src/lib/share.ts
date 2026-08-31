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

// Attempts the OS share sheet with the branded OG card image attached as a
// file, where the platform supports it (most mobile share sheets do) — so
// WhatsApp/etc. shows the actual card image + caption, not just a link
// that resolves to a preview later. `imageUrl` is the page's own
// file-convention opengraph-image route (e.g. `${inviteUrl}/opengraph-image`),
// so it's always the same card a link-preview crawler would generate.
// Returns "shared" on success (or the user dismissing the sheet) and
// "unavailable" when there's nothing to fall back from (no Web Share API,
// or it threw for a reason other than the user cancelling) — callers pick
// their own fallback.
async function tryShareWithImage(text: string, imageUrl: string): Promise<"shared" | "unavailable"> {
  if (typeof navigator === "undefined" || !navigator.share) return "unavailable";

  let file: File | null = null;
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    file = new File([blob], "myludo-invite.png", { type: blob.type || "image/png" });
  } catch {
    file = null; // image fetch failed — text-only share is still fine
  }
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ text, files: [file] });
    } else {
      await navigator.share({ text });
    }
    return "shared";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "shared"; // user dismissed the sheet
    return "unavailable";
  }
}

// Falls back to the WhatsApp deep link if the Web Share API isn't
// available or fails (most desktop browsers).
export async function shareWithImage(text: string, imageUrl: string) {
  if ((await tryShareWithImage(text, imageUrl)) === "unavailable") shareOnWhatsApp(text);
}

export function roomJoinUrl(roomCode: string) {
  return `${window.location.origin}/join?code=${roomCode}`;
}

export type ShareResult = "shared" | "copied";

// Falls back to copying `url` to the clipboard if the Web Share API isn't
// available or fails — for the "Copy link" action on the Friends page,
// where a plain clipboard copy is the more natural fallback than opening
// WhatsApp. Caller shows its own "Copied!" feedback based on the result.
export async function shareOrCopyWithImage(text: string, imageUrl: string, url: string): Promise<ShareResult> {
  if ((await tryShareWithImage(text, imageUrl)) === "shared") return "shared";
  await navigator.clipboard.writeText(url);
  return "copied";
}

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
