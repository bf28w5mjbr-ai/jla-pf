import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}): Promise<Metadata> {
  const { id, eventId } = await params;
  const event = await prisma.event.findFirst({
    where: { id: eventId, competitionId: id },
    select: { name: true, competition: { select: { name: true } } },
  });
  if (!event) {
    return { title: "競技結果 | Bluvium" };
  }
  return {
    title: `${event.name} スタートリスト | ${event.competition.name} | Bluvium`,
    description: `${event.competition.name} ${event.name} のスタートリスト・競技結果`,
  };
}

/** @deprecated 公開はスタートリストへ一本化。旧 URL 互換のリダイレクト */
export default async function CompetitionPublicEventResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ roundIndex?: string }>;
}) {
  const { id: competitionId, eventId } = await params;
  const { roundIndex: roundIndexRaw } = await searchParams;

  const event = await prisma.event.findFirst({
    where: { id: eventId, competitionId },
    select: { id: true },
  });
  if (!event) {
    notFound();
  }

  const roundIndexParsed =
    roundIndexRaw != null && roundIndexRaw !== "" ? Number.parseInt(roundIndexRaw, 10) : null;
  const roundIndex =
    roundIndexParsed != null && Number.isInteger(roundIndexParsed) && roundIndexParsed >= 0
      ? roundIndexParsed
      : null;

  const base = `/competitions/${competitionId}/start-list/${eventId}`;
  const destination =
    roundIndex != null ? `${base}?roundIndex=${roundIndex}` : base;
  redirect(destination);
}
