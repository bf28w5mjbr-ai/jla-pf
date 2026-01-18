import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import JoinClubForm from '@/components/JoinClubForm';

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return {
    title: 'クラブ参加申請 | JLA PF',
  };
}

export default async function JoinClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const club = await prisma.club.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      officeAddress: true,
      status: true,
    }
  });

  if (!club) {
    redirect("/clubs");
  }

  // 既に参加申請しているかチェック
  const existingMembership = await prisma.membership.findUnique({
    where: {
      userId_clubId: {
        userId: sess.userId,
        clubId: params.id,
      }
    }
  });

  if (existingMembership) {
    redirect("/clubs");
  }

  return (
    <PageLayout title={`${club.name}に参加`} description="クラブへの参加を申請します">
      <JoinClubForm club={club} />
    </PageLayout>
  );
}
