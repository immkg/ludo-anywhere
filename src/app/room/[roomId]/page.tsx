import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import RoomPageClient from "@/components/lobby/RoomPageClient";

export default async function RoomPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return <RoomPageClient />;
}
