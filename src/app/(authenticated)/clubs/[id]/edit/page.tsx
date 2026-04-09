import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import EditClubForm from '@/components/EditClubForm';
import DeleteClubButton from '@/components/DeleteClubButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isClubAdminRole } from '@/lib/roleScopes';

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { name: true }
  });
  
  return {
    title: `${club?.name || 'クラブ'}編集 | Bluvium`,
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
    redirect(appRoutes.clubs.list());
  }

  // 管理者かチェック
  const membership = await prisma.membership.findUnique({
    where: {
      userId_clubId: {
        userId: sess.userId,
        clubId: id,
      }
    }
  });

  if (!membership || !isClubAdminRole(membership.role)) {
    redirect(appRoutes.clubs.root(id));
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">クラブ情報の編集</h1>
        <p className="text-muted-foreground mt-2">{club.name}</p>
      </div>

      <div className="space-y-8">
        <EditClubForm club={club} />

        {/* クラブ削除（管理者） */}
        {isClubAdminRole(membership.role) && (
          <Card className="w-full max-w-2xl border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10">
            <CardHeader className="bg-transparent border-b border-red-200 dark:border-red-900/40">
              <CardTitle className="text-xl text-red-800 dark:text-red-300">危険な操作</CardTitle>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                このセクションの操作は取り消せません。内容を十分確認して実行してください。
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <DeleteClubButton clubId={club.id} clubName={club.name} />
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
