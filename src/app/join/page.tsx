import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import JoinRoom from "@/components/lobby/JoinRoom";

export default async function JoinPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return <JoinRoom />;
}
