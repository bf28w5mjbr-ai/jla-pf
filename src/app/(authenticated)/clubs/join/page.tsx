import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import ClubSearchList from '@/components/ClubSearchList';

export const metadata: Metadata = {
  title: 'クラブに参加 | Bluvium',
};

export const dynamic = "force-dynamic";

export default async function ClubJoinPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      memberships: {
        select: {
          clubId: true,
          status: true,
        },
      },
    },
  });

  if (!user) redirect("/login");

  const excludeClubIds = user.memberships
    .filter((m) => m.status === "APPROVED" || m.status === "PENDING")
    .map((m) => m.clubId);

  return (
    
      <ClubSearchList excludeClubIds={excludeClubIds} />
    
  );
}
