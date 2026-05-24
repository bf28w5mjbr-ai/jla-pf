import Link from "next/link";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import DayOpsUnlockBanner from "@/components/DayOpsUnlockBanner";
import StartListEventUnifiedCard from "@/components/StartListEventUnifiedCard";
import {
  getStartListEventDetail,
  loadStartListEventPage,
} from "@/lib/startListEventPageLoader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}): Promise<Metadata> {
  const { id, eventId } = await params;
  const event = await getStartListEventDetail(id, eventId);
  return {
    title: event?.name ? `${event.name} スタートリスト | Bluvium` : "スタートリスト | Bluvium",
  };
}

export default async function CompetitionEventStartListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ roundIndex?: string }>;
}) {
  const { id: competitionId, eventId } = await params;
  const sp = await searchParams;
  const rawRoundIndex = sp.roundIndex;
  const parsedRoundIndex =
    typeof rawRoundIndex === "string" && rawRoundIndex.trim() !== ""
      ? Number.parseInt(rawRoundIndex, 10)
      : Number.NaN;
  const initialRoundIndex =
    Number.isFinite(parsedRoundIndex) &&
    Number.isInteger(parsedRoundIndex) &&
    parsedRoundIndex >= 0
      ? parsedRoundIndex
      : null;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  const loaded = await loadStartListEventPage({
    competitionId,
    eventId,
    sessionToken: token,
    initialRoundIndex,
  });

  if (loaded.kind === "notFound") {
    notFound();
  }

  if (loaded.kind === "hidden") {
    return (
      <div className="app-page mx-auto max-w-3xl space-y-3.5 px-3 py-4 sm:max-w-4xl sm:px-5 sm:py-6">
        <DayOpsUnlockBanner
          competitionId={loaded.competitionId}
          passphraseConfigured={loaded.dayOpsUnlockConfigured}
          alreadyUnlocked={loaded.hasDayOpsUnlock}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1 px-3 text-xs shadow-sm" asChild>
            <Link href={`/competitions/${loaded.competitionId}`}>
              <ChevronLeft className="size-4" />
              大会ページへ
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          この大会のスタートリスト全体が主催の設定により非公開です（種目ごとの切替ではありません）。主催管理者または当日運用でアンロック済みの端末から閲覧できます。
        </p>
      </div>
    );
  }

  const {
    dayOpsUnlockConfigured,
    hasDayOpsUnlock,
    showUnifiedStartListCard,
    showVenueOps,
    canManageStartListOps,
    isOrgAdmin,
    competitionName,
    startListSettings,
    archiveRecordedAtIso,
    scheduleLabel,
    event,
    individuals,
    teams,
    officialRanksByRound,
    placementSeed,
    frozenSnapshotRounds,
    participantStatusByKey,
    participantStatusRows,
    roundHeatBarItems,
  } = loaded;

  return (
    <div className="app-page mx-auto max-w-3xl space-y-3.5 px-3 py-4 sm:max-w-4xl sm:px-5 sm:py-6">
      <DayOpsUnlockBanner
        competitionId={competitionId}
        passphraseConfigured={dayOpsUnlockConfigured}
        alreadyUnlocked={hasDayOpsUnlock}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1 px-3 text-xs shadow-sm" asChild>
          <Link href={`/competitions/${competitionId}?tab=start-list`}>
            <ChevronLeft className="size-4" />
            タイムスケジュールへ
          </Link>
        </Button>
      </div>

      <StartListEventUnifiedCard
        variant={showUnifiedStartListCard ? "ops" : "public"}
        competitionId={competitionId}
        competitionName={competitionName}
        archiveRecordedAtIso={archiveRecordedAtIso}
        event={{
          id: event.id,
          name: event.name,
          sex: event.sex,
          type: event.type,
          ageCategoryName: event.ageCategoryName,
        }}
        initialSettings={startListSettings}
        defaultMaxLanesPerRace={event.preliminaryHeatLaneCount}
        configuredStartListRoundCount={event.startListRoundCount}
        entryCount={event.type === "TEAM" ? teams.length : individuals.length}
        scheduleLabel={scheduleLabel}
        individuals={individuals}
        teams={teams}
        officialRanksByRound={officialRanksByRound}
        placementSeed={placementSeed}
        frozenSnapshotRounds={frozenSnapshotRounds}
        startListRoundCount={event.startListRoundCount}
        preliminaryHeatLaneCount={event.preliminaryHeatLaneCount}
        heatPlanConfirmedAtIso={event.heatPlanConfirmedAtIso}
        marshalStartedAtIso={event.marshalStartedAtIso}
        canEditHeatConfiguration={canManageStartListOps}
        canEditPublishedScheduleForRoundSetup={isOrgAdmin}
        showMarshalOps={showVenueOps}
        showResultOps={showVenueOps}
        participantStatusByKey={participantStatusByKey}
        initialParticipantStatusRows={participantStatusRows}
        initialRoundIndex={initialRoundIndex}
        roundHeatBarItems={roundHeatBarItems}
        softRefreshIntervalSec={showUnifiedStartListCard ? undefined : 25}
      />
    </div>
  );
}
