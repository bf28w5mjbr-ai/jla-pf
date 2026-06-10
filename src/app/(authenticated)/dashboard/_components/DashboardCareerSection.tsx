import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import type { UserPodiumResultRow } from "@/lib/dashboardUserPodiumResults";
import { podiumResultRoundLabel } from "@/lib/dashboardUserPodiumResults";
import { cn } from "@/lib/utils";
import {
  attendanceMethodClass,
  formatCareerDate,
  officialCompetitionTypeClass,
  officialCompetitionTypeLabel,
  podiumRankVisual,
} from "./dashboardCareerVisual";

type AttendanceRow = {
  id: string;
  attendanceDate: Date;
  method: string;
  competition: {
    id: string;
    name: string;
    competitionType: string | null;
  };
};

type Stats = {
  totalDays: number;
  weightedDays: number;
  aClassDays: number;
  bClassDays: number;
};

function CareerEmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border/70 px-5 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function CareerSubheading({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function DashboardCareerStats({ stats }: { stats: Stats }) {
  const items = [
    { label: "実出席日数", value: `${stats.totalDays}`, unit: "日", compact: false },
    { label: "換算活動日数", value: stats.weightedDays.toFixed(1), unit: "日", compact: false },
    {
      label: "内訳",
      value: `A ${stats.aClassDays}日 / B ${stats.bClassDays}日`,
      unit: "",
      compact: true,
    },
  ] as const;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6",
        "transition-[border-color,background-color] duration-200 hover:border-orange-200/70 hover:bg-orange-50/20 dark:hover:border-orange-900/45 dark:hover:bg-orange-950/10"
      )}
    >
      <div
        className="pointer-events-none absolute -left-8 top-1/2 size-32 -translate-y-1/2 rounded-full bg-orange-500/8 dark:bg-orange-400/6"
        aria-hidden
      />
      <div
        className="absolute bottom-4 left-0 top-4 w-0.5 rounded-full bg-gradient-to-b from-orange-500/70 via-orange-400/30 to-transparent sm:bottom-5 sm:top-5"
        aria-hidden
      />

      <div className="relative grid gap-5 sm:grid-cols-3 sm:gap-4">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 pl-3 sm:pl-4">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                "mt-1.5 font-semibold tabular-nums tracking-tight text-foreground",
                item.compact
                  ? "text-base leading-snug sm:text-lg"
                  : "text-2xl sm:text-[1.65rem]"
              )}
            >
              {item.value}
              {item.unit ? (
                <span className="ml-0.5 text-base font-medium text-muted-foreground">{item.unit}</span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardOfficialAttendanceItem({ row }: { row: AttendanceRow }) {
  const type = row.competition.competitionType;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border/55 bg-background/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5",
        "transition-colors hover:border-orange-200/60 hover:bg-orange-50/15 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/10"
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium text-foreground sm:text-[0.9375rem]">
          {row.competition.name}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5 opacity-70" strokeWidth={1.75} aria-hidden />
            {formatCareerDate(row.attendanceDate)}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
            officialCompetitionTypeClass(type)
          )}
        >
          {officialCompetitionTypeLabel(type)}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
            attendanceMethodClass(row.method)
          )}
        >
          {row.method === "NFC" ? "NFC" : "手動"}
        </span>
      </div>
    </div>
  );
}

function DashboardPodiumResultItem({ row }: { row: UserPodiumResultRow }) {
  const competition = row.officialResult.competition;
  const event = row.officialResult.event;
  const roundLabel = podiumResultRoundLabel(row);
  const rank = row.rank;
  const rankVisual = rank != null ? podiumRankVisual(rank) : null;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-border/55 bg-background/60 p-4 sm:gap-4 sm:p-5",
        "transition-colors hover:border-orange-200/60 hover:bg-orange-50/15 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/10"
      )}
    >
      {rankVisual ? (
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border text-lg font-semibold tabular-nums",
            rankVisual.className
          )}
          aria-label={`${rank}位`}
        >
          {rankVisual.label}
        </div>
      ) : null}

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug text-foreground sm:text-[0.9375rem]">
          <Link
            href={appRoutes.competitions.results(competition.id)}
            className="transition-colors hover:text-orange-700 dark:hover:text-orange-200"
          >
            {competition.name}
          </Link>
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {event.name}
          <span className="mx-1.5 opacity-40">·</span>
          {roundLabel}
        </p>
        {row.entryType === "TEAM" && row.teamEntry?.teamName ? (
          <p className="text-xs text-muted-foreground">チーム {row.teamEntry.teamName}</p>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardCareerSection({
  stats,
  attendancePreview,
  podiumResults,
}: {
  stats: Stats;
  attendancePreview: AttendanceRow[];
  podiumResults: UserPodiumResultRow[];
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Career
      </p>
      <h3 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        経歴
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        オフィシャル活動実績と大会成績（決勝・1〜3位）
      </p>

      <div className="mt-6 space-y-8">
        <section className="space-y-4">
          <CareerSubheading>Official</CareerSubheading>
          <DashboardCareerStats stats={stats} />

          {stats.totalDays === 0 ? (
            <CareerEmptyState>まだオフィシャル出席実績がありません。</CareerEmptyState>
          ) : (
            <div className="space-y-2">
              {attendancePreview.map((row) => (
                <DashboardOfficialAttendanceItem key={row.id} row={row} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <CareerSubheading>Podium</CareerSubheading>
          {podiumResults.length === 0 ? (
            <CareerEmptyState>1〜3位の決勝成績はまだありません。</CareerEmptyState>
          ) : (
            <div className="space-y-2">
              {podiumResults.map((row) => (
                <DashboardPodiumResultItem key={row.id} row={row} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
