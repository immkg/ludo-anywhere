import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTopPlayers } from "@/lib/leaderboard";
import GuestNav from "@/components/nav/GuestNav";
import GuestDashboard from "@/components/home/GuestDashboard";

// Where the landing page's "Play Now" button lands — a guest-friendly
// dashboard, separate from "/" so the marketing page stays a fast,
// crawlable, session-free landing page. Signed-in visitors are sent to "/"
// itself (see src/app/page.tsx), which is the real dashboard once there's
// an account and stats to show.
export default async function PlayPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const topPlayers = await getTopPlayers(5);

  return (
    <GuestNav>
      <GuestDashboard topPlayers={topPlayers} />
    </GuestNav>
  );
}
