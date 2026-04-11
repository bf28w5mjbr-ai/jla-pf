import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { appRoutes } from "@/lib/appRoutes";
import ClubSearchList from "@/components/ClubSearchList";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export const metadata: Metadata = {
  title: "クラブ検索・申請 | Bluvium",
};

export default async function ProfileClubsPage() {
  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const sess = token ? await verifySession(token) : null;

  if (!sess?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      memberships: {
        select: { clubId: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const excludeClubIds = user.memberships.map((m) => m.clubId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">クラブ検索・申請</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            クラブ名で検索し、参加申請を送れます。新規にクラブを立ち上げる場合は「クラブを作成」から手続きできます。
          </p>
        </div>
        <Button asChild className="h-10 shrink-0 gap-1.5 self-start sm:self-auto">
          <Link href={appRoutes.clubs.create()}>
            <Plus className="h-4 w-4" aria-hidden />
            クラブを作成
          </Link>
        </Button>
      </div>
      <ClubSearchList excludeClubIds={excludeClubIds} />
    </div>
  );
}
