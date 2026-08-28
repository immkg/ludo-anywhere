import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets dev (HMR, hydration assets) load when this device is reached over
  // the LAN by IP instead of localhost — Next.js blocks cross-origin dev
  // requests by default, which otherwise breaks hydration silently (page
  // renders, but no client JS ever attaches: buttons don't respond, and
  // session/state that depends on an effect never resolves).
  allowedDevOrigins: ["192.168.1.10", "regular-aware-lemming.ngrok-free.app"],
};

export default nextConfig;
