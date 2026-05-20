import { Metadata } from "next";
import Link from "next/link";

import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { getCompetitionManagementAccessByCompetitionId } from "@/lib/competitionManagementAccess";
import { OfficialResultManager } from "@/components/OfficialResultManager";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const userId = await getRequiredAuthenticatedUserId();
    const access = await getCompetitionManagementAccessByCompetitionId(id, userId);
    if (access.kind === "ok") {
      return {
        title: `結果管理 | ${access.name || "大会"} | Bluvium`,
      };
    }
  } catch {
    // unauthenticated metadata
  }
  return { title: "結果管理 | 大会 | Bluvium" };
}

export default async function CompetitionResultManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getRequiredAuthenticatedUserId();

  const access = await getCompetitionManagementAccessByCompetitionId(id, userId);
  if (access.kind === "not_found") {
    notFound();
  }
  if (access.kind === "forbidden" || access.kind === "wrong_org") {
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
      <OfficialResultManager competitionId={id} canEdit />
    </div>
  );
}