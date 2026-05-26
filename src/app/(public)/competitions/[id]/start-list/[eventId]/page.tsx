import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import StartListEventPageShell from "@/components/StartListEventPageShell";
import StartListEventUnifiedCard from "@/components/StartListEventUnifiedCard";
import {
  getStartListEventDetail,
  loadStartListEventPage,
} from "@/lib/startListEventPageLoader";
import { parseRoundIndexSearchParam } from "@/lib/parseRoundIndexSearchParam";

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
  const initialRoundIndex = parseRoundIndexSearchParam(sp.roundIndex);
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  const loaded = await loadStartListEventPage({
    competitionId,
    eventId,
    sessionToken: token,
  });

  if (loaded.kind === "notFound") {
    notFound();
  }

  if (loaded.kind === "hidden") {
    return (
      <StartListEventPageShell
        competitionId={loaded.competitionId}
        dayOpsUnlockConfigured={loaded.dayOpsUnlockConfigured}
        hasDayOpsUnlock={loaded.hasDayOpsUnlock}
        backHref={`/competitions/${loaded.competitionId}`}
        backLabel="大会ページへ"
      >
        <p className="text-sm text-muted-foreground">
          この大会のスタートリスト全体が主催の設定により非公開です（種目ごとの切替ではありません）。主催管理者または当日運用でアンロック済みの端末から閲覧できます。
        </p>
      </StartListEventPageShell>
    );
  }

  const cardProps = {
    ...loaded.cardProps,
    initialRoundIndex,
  };

  return (
    <StartListEventPageShell
      competitionId={loaded.competitionId}
      dayOpsUnlockConfigured={loaded.dayOpsUnlockConfigured}
      hasDayOpsUnlock={loaded.hasDayOpsUnlock}
      backHref={`/competitions/${competitionId}?tab=start-list`}
      backLabel="タイムスケジュールへ"
    >
      <StartListEventUnifiedCard {...cardProps} />
    </StartListEventPageShell>
  );
}
