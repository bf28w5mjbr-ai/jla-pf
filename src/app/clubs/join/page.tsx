import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import ClubSearchList from '@/components/ClubSearchList';

export const metadata: Metadata = {
  title: 'クラブに参加 | JLA PF',
};

export const dynamic = "force-dynamic";

export default async function ClubJoinPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      role: true,
      memberships: {
        select: {
          role: true,
          clubId: true,
          status: true,
        }
      }
    }
  });

  if (!user) redirect("/login");

  const isClubOwner = user.memberships.some(m => m.role === 'OWNER');

  // 既に申請中または所属しているクラブIDのリスト
  const excludeClubIds = user.memberships.map(m => m.clubId);

  return (
    <PageLayout 
      userRole={user.role} 
      isClubOwner={isClubOwner}
      title="クラブに参加"
      description="参加したいクラブを検索して、参加申請を送信できます"
    >
      <ClubSearchList 
        userId={user.id}
        excludeClubIds={excludeClubIds}
      />
    </PageLayout>
  );
}
