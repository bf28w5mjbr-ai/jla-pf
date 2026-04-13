import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import ClubSearchList from "@/components/ClubSearchList";

export const metadata: Metadata = {
  title: "クラブ | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      memberships: {
        select: { clubId: true, status: true },
      },
    },
  });

  if (!user) redirect("/login");

  const excludeClubIds = user.memberships
    .filter((m) => m.status === "APPROVED" || m.status === "PENDING")
    .map((m) => m.clubId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">クラブ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          クラブ名で検索し、参加できます。
        </p>
      </div>
      <ClubSearchList excludeClubIds={excludeClubIds} />
    </div>
  );
}
