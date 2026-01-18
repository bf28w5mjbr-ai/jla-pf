import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import EditClubForm from '@/components/EditClubForm';
import DeleteClubButton from '@/components/DeleteClubButton';

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true }
  });
  
  return {
    title: `${club?.name || 'クラブ'}編集 | JLA PF`,
  };
}

export default async function EditClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const club = await prisma.club.findUnique({
    where: { id },
  });

  if (!club) {
    redirect("/clubs");
  }

  // オーナーまたは管理者かチェック
  const membership = await prisma.membership.findUnique({
    where: {
      userId_clubId: {
        userId: sess.userId,
        clubId: id,
      }
    }
  });

  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
    redirect(`/clubs/${id}`);
  }

  return (
    <PageLayout title={`${club.name}を編集`} description="クラブ情報を更新します">
      <div className="space-y-8">
        <EditClubForm club={club} />

        {/* クラブ削除（OWNERのみ） */}
        {membership.role === 'OWNER' && (
          <div>
            <h2 className="text-xl font-bold text-red-800 dark:text-red-300 mb-4">
              危険な操作
            </h2>
            <DeleteClubButton clubId={club.id} clubName={club.name} />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
