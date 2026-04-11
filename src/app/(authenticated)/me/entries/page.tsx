import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { verifySessionCached } from "@/lib/auth";
import { loadEntryHistoryForUser } from "@/lib/entryHistory";
import EntryHistoryList from "@/components/EntryHistoryList";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "エントリー履歴 | Bluvium",
};

export default async function MyEntriesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const entries = await loadEntryHistoryForUser(session.userId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <Link href={appRoutes.dashboard()}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          ダッシュボード
        </Link>
      </Button>
      <EntryHistoryList entries={entries} context="personal" />
    </div>
  );
}
