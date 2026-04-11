import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { verifySessionCached } from "@/lib/auth";
import CreateClubForm from "@/components/CreateClubForm";

export const metadata: Metadata = {
  title: "クラブ作成 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function CreateClubPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link
          href={appRoutes.profile.clubs()}
          className="mb-6 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          クラブ検索・申請へ戻る
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">クラブを作成</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          基本情報と事務局の連絡先を入力してください。送信後、クラブはその時点で成立し、メンバー運用などを始められます。
        </p>
      </div>
      <CreateClubForm />
    </div>
  );
}
