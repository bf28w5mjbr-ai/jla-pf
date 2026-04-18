import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { requirePfAdmin } from "@/lib/accessControl";
import AdminNotificationBroadcastForm from "@/components/admin/AdminNotificationBroadcastForm";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  try {
    await requirePfAdmin(session.userId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="app-page mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <AdminNotificationBroadcastForm />
    </div>
  );
}
