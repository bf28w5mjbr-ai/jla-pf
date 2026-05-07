
import { redirect } from "next/navigation";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { requirePfAdmin } from "@/lib/accessControl";
import AdminNotificationBroadcastForm from "@/components/admin/AdminNotificationBroadcastForm";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const userId = await getRequiredAuthenticatedUserId();

  try {
    await requirePfAdmin(userId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="app-page mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <AdminNotificationBroadcastForm />
    </div>
  );
}
