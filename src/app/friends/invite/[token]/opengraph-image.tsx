import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogCard";

export const runtime = "edge";
export const alt = "You're invited to play Ludo on MyLudo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(<OgCard />, { ...size });
}
