import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { OfficialResultManager } from "@/components/OfficialResultManager";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { name: true },
  });
  return {
    title: `結果管理 | ${competition?.name || "大会"} | Bluvium`,
  };
}

export default async function CompetitionResultManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          admins: {
            where: { userId: session.userId },
          },
        },
      },
    },
  });

  if (!competition) {
    notFound();
  }

  if (!hasOrgAdminAccess(competition.organization.admins)) {
    redirect(`/competitions/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" asChild>
          <Link href={`/competitions/${id}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            大会ページへ
          </Link>
        </Button>
      </div>
      <OfficialResultManager competitionId={competition.id} canEdit />
    </div>
  );
}
