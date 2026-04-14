import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import ClubSearchList from "@/components/ClubSearchList";
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
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">クラブ検索・参加</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            クラブ名で検索して参加できます。
          </p>
        </div>
      </div>
      <ClubSearchList excludeClubIds={excludeClubIds} />
    </div>
  );
}
