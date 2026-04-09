import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/server/db";

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
    title: `エントリー | ${competition?.name || "大会"} | Bluvium`,
  };
}

/** 表示は `/entry` のフォームに集約。旧 URL・Stripe success_url の互換のためリダイレクトのみ。 */
export default async function CompetitionEntryCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entryId?: string; session_id?: string }>;
}) {
  const { id } = await params;
  const { entryId, session_id } = await searchParams;

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!competition) {
    notFound();
  }

  const qs = new URLSearchParams();
  qs.set("completed", "1");
  if (entryId) qs.set("entryId", entryId);
  if (session_id) qs.set("session_id", session_id);

  redirect(`/competitions/${competition.id}/entry?${qs.toString()}`);
}
