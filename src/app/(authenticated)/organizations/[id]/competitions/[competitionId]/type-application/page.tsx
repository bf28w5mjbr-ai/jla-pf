import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySessionCached } from "@/lib/auth";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import CompetitionTypeApplicationForm from "@/components/CompetitionTypeApplicationForm";

export const dynamic = "force-dynamic";

export default async function CompetitionTypeApplicationPage({
  params,
}: {
  params: Promise<{ id: string; competitionId: string }>;
}) {
  const { id: organizationId, competitionId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);
  if (!session?.userId) {
    redirect("/login");
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      competitionType: true,
      organization: {
        include: {
          admins: {
            where: { userId: session.userId },
          },
        },
      },
      typeApplications: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          requestedType: true,
          status: true,
          rejectionReason: true,
          reviewedAt: true,
          approvedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!competition || competition.organizationId !== organizationId) {
    notFound();
  }

  const canEdit = hasOrgAdminAccess(competition.organization.admins);
  if (!canEdit) {
    redirect(`/organizations/${organizationId}/competitions/${competitionId}`);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href={`/organizations/${organizationId}/competitions/${competitionId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            大会管理に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">大会種別申請</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PF管理者へ大会種別（A級 / B級）を申請します。
          </p>
        </div>
      </div>

      <CompetitionTypeApplicationForm
        organizationId={organizationId}
        competitionId={competitionId}
        competitionName={competition.name}
        currentCompetitionType={competition.competitionType}
        initialHistory={competition.typeApplications.map((row) => ({
          ...row,
          reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
          approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
