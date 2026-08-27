import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import CreateRoom from "@/components/lobby/CreateRoom";

export default async function CreatePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return <CreateRoom />;
}
