export function shareOnWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

export function roomJoinUrl(roomCode: string) {
  return `${window.location.origin}/join?code=${roomCode}`;
}
