import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogCard";

export const runtime = "edge";
export const alt = "MyLudo — Play Ludo Online with Friends";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(<OgCard />, { ...size });
}
