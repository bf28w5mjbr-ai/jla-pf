import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/authenticatedLayoutData";
import { DashboardMainDeferred } from "./DashboardMainDeferred";

export async function DashboardMainDeferredSlot({ userId }: { userId: string }) {
  const user = await getAuthenticatedAppUser(userId);
  if (!user) redirect("/login");

  return <DashboardMainDeferred user={user} />;
}
