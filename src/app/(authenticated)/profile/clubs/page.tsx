import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import ClubSearchList from "@/components/ClubSearchList";
import { Button } from "@/components/ui/button";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";

export const metadata: Metadata = {
  title: "クラブ検索・参加 | Bluvium",
};

export default async function ProfileClubsPage() {
  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      memberships: {
        select: { clubId: true, status: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const excludeClubIds = user.memberships
    .filter((m) => m.status === "APPROVED" || m.status === "PENDING")
    .map((m) => m.clubId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            ダッシュボードに戻る
          </Link>
        </Button>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium">クラブ</span>
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            クラブを探して参加
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            公開されているライフセービングクラブから選び、参加申請を送れます。すでに所属中・申請中のクラブは一覧に出ません。
          </p>
        </div>
      </header>

      <ClubSearchList excludeClubIds={excludeClubIds} />
    </div>
  );
}
