import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CompetitionPublicEventResultsDisplay } from "@/components/public/CompetitionPublicEventResultsDisplay";
import { loadCompetitionOfficialResultsPublicPayload } from "@/lib/competitionOfficialResultsPublicPayload";
import { displayResultRoundLabel } from "@/lib/resultRoundLabels";
import { Button } from "@/components/ui/button";
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
    title: `${event.name} 競技結果 | ${event.competition.name} | Bluvium`,
    description: `${event.competition.name} ${event.name} の公式競技結果`,
  };
}

export default async function CompetitionPublicEventResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ roundIndex?: string }>;
}) {
  const { id: competitionId, eventId } = await params;
  const { roundIndex: roundIndexRaw } = await searchParams;
  const roundIndexParsed =
    roundIndexRaw != null && roundIndexRaw !== "" ? Number.parseInt(roundIndexRaw, 10) : null;
  const roundIndex =
    roundIndexParsed != null && Number.isInteger(roundIndexParsed) && roundIndexParsed >= 0
      ? roundIndexParsed
      : null;

  const payload = await loadCompetitionOfficialResultsPublicPayload(competitionId, eventId, {
    roundIndex,
  });
  if (!payload) {
    notFound();
  }

  const roundTitle =
    payload.highlightRound != null
      ? displayResultRoundLabel(
          payload.highlightRound,
          payload.roundLabelsByEventId[payload.event.id]
        )
      : null;

  return (
    <div className="app-page mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
        <Link href={`/competitions/${competitionId}?tab=results`}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          競技結果（タイムテーブル）に戻る
        </Link>
      </Button>

      <header className="space-y-1 border-b border-border/80 pb-4">
        <p className="text-xs text-muted-foreground">{payload.competition.name}</p>
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {payload.event.name}
        </h1>
        {roundTitle ? (
          <p className="text-sm text-muted-foreground">ラウンド: {roundTitle}</p>
        ) : (
          <p className="text-sm text-muted-foreground">公式競技結果（公開済み）</p>
        )}
      </header>

      <CompetitionPublicEventResultsDisplay {...payload} />
    </div>
  );
}
