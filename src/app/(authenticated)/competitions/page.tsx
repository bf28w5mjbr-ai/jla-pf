import { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Calendar,
  CalendarRange,
  ChevronRight,
  History,
  ListFilter,
  MapPin,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  competitionHostAbbreviation,
  competitionHostDisplayName,
} from "@/lib/competitionHostDisplay";
import { OrganizationLogoImage } from "@/components/OrganizationLogoImage";
import {
  CompetitionsListControls,
  type CompetitionListSort,
} from "@/components/competitions/CompetitionsListControls";
import { formatCompactJaDateRange } from "@/lib/datetimeLocal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function entryVolume<T extends { _count: { entries: number; teamEntries: number } }>(
  c: T
): number {
  return c._count.entries + c._count.teamEntries;
}

function sortCompetitionBucket<
  T extends {
    startDate: Date;
    entryEndDate: Date | null;
    _count: { entries: number; teamEntries: number };
  },
>(list: T[], mode: CompetitionListSort, bucket: "upcoming" | "past"): T[] {
  const out = [...list];
  const startTs = (c: T) => new Date(c.startDate).getTime();
  const endTs = (c: T) => (c.entryEndDate ? new Date(c.entryEndDate).getTime() : null);

  if (mode === "start") {
    out.sort((a, b) => {
      const d = startTs(a) - startTs(b);
      return bucket === "upcoming" ? d : -d;
    });
  } else if (mode === "entry_end") {
    out.sort((a, b) => {
      const ae = endTs(a);
      const be = endTs(b);
      if (ae == null && be == null) {
        const d = startTs(a) - startTs(b);
        return bucket === "upcoming" ? d : -d;
      }
      if (ae == null) return 1;
      if (be == null) return -1;
      const d = ae - be;
      if (d !== 0) return bucket === "upcoming" ? d : -d;
      const sd = startTs(a) - startTs(b);
      return bucket === "upcoming" ? sd : -sd;
    });
  } else {
    out.sort((a, b) => {
      const ca = entryVolume(a);
      const cb = entryVolume(b);
      if (cb !== ca) return cb - ca;
      const d = startTs(a) - startTs(b);
      return bucket === "upcoming" ? d : -d;
    });
  }
  return out;
}

export const metadata: Metadata = {
  title: "大会一覧 | Bluvium",
  description: "ライフセービング大会一覧",
};

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    view?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const categoryFilter = params.category;
  const selectedCategory =
    categoryFilter && categoryFilter !== "ALL" ? categoryFilter : "ALL";
  const viewParam = params.view;
  const selectedView =
    viewParam === "upcoming" || viewParam === "past" ? viewParam : "all";
  const searchQuery = (params.q ?? "").trim();
  const sortParam = params.sort;
  const sortMode: CompetitionListSort =
    sortParam === "entry_end" || sortParam === "entries" ? sortParam : "start";

  const whereCondition: Prisma.CompetitionWhereInput = {
    isPublished: true,
    status: "PUBLISHED",
  };

  if (categoryFilter && categoryFilter !== "ALL") {
    whereCondition.category = categoryFilter;
  }
  if (searchQuery.length > 0) {
    whereCondition.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { nameKana: { contains: searchQuery, mode: "insensitive" } },
      { venue: { contains: searchQuery, mode: "insensitive" } },
      { organization: { name: { contains: searchQuery, mode: "insensitive" } } },
      {
        organization: {
          abbreviation: { contains: searchQuery, mode: "insensitive" },
        },
      },
    ];
  }

  const listInclude = {
    organization: {
      select: {
        id: true,
        name: true,
        abbreviation: true,
        logoUrl: true,
      },
    },
    _count: {
      select: { entries: true, teamEntries: true },
    },
  } as const;

  type CompetitionListItem = Prisma.CompetitionGetPayload<{ include: typeof listInclude }>;

  const now = new Date();
  const upcomingWhere: Prisma.CompetitionWhereInput = {
    ...whereCondition,
    startDate: { gte: now },
  };
  const pastWhere: Prisma.CompetitionWhereInput = {
    ...whereCondition,
    startDate: { lt: now },
  };

  /** 一覧の最大行数（TTFB とレスポンス肥大化を抑える） */
  const MAX_BUCKET_ALL_VIEW = 120;
  const MAX_BUCKET_SINGLE_VIEW = 400;

  const upcomingTake =
    selectedView === "past"
      ? 0
      : selectedView === "all"
        ? MAX_BUCKET_ALL_VIEW
        : MAX_BUCKET_SINGLE_VIEW;
  const pastTake =
    selectedView === "upcoming"
      ? 0
      : selectedView === "all"
        ? MAX_BUCKET_ALL_VIEW
        : MAX_BUCKET_SINGLE_VIEW;

  const [
    upcomingRows,
    pastRows,
    totalCount,
    upcomingCount,
    pastCount,
    categoryGroups,
  ] = await Promise.all([
    upcomingTake > 0
      ? prisma.competition.findMany({
          where: upcomingWhere,
          include: listInclude,
          orderBy: { startDate: "asc" },
          take: upcomingTake,
        })
      : Promise.resolve([] as CompetitionListItem[]),
    pastTake > 0
      ? prisma.competition.findMany({
          where: pastWhere,
          include: listInclude,
          orderBy: { startDate: "desc" },
          take: pastTake,
        })
      : Promise.resolve([] as CompetitionListItem[]),
    prisma.competition.count({ where: whereCondition }),
    prisma.competition.count({ where: upcomingWhere }),
    prisma.competition.count({ where: pastWhere }),
    prisma.competition.groupBy({
      by: ["category"],
      where: {
        isPublished: true,
        status: "PUBLISHED",
        category: { not: null },
      },
    }),
  ]);

  const availableCategories = categoryGroups
    .map((item) => item.category?.trim() ?? "")
    .filter((value): value is string => value.length > 0)
    .sort((a, b) => a.localeCompare(b, "ja"));

  const upcomingCompetitions = upcomingRows;
  const pastCompetitions = pastRows;
  const listTruncated =
    selectedView === "all" &&
    (upcomingCount > upcomingCompetitions.length || pastCount > pastCompetitions.length);
  const visibleUpcomingCompetitions =
    selectedView === "past"
      ? []
      : sortCompetitionBucket(upcomingCompetitions, sortMode, "upcoming");
  const visiblePastCompetitions =
    selectedView === "upcoming"
      ? []
      : sortCompetitionBucket(pastCompetitions, sortMode, "past");

  const buildListHref = (parts?: {
    category?: string;
    view?: string;
    q?: string;
    sort?: CompetitionListSort;
  }) => {
    const category = parts?.category !== undefined ? parts.category : selectedCategory;
    const view = parts?.view !== undefined ? parts.view : selectedView;
    const qVal = parts?.q !== undefined ? parts.q : searchQuery;
    const sort = parts?.sort !== undefined ? parts.sort : sortMode;

    const query = new URLSearchParams();
    if (category !== "ALL") {
      query.set("category", category);
    }
    if (view !== "all") {
      query.set("view", view);
    }
    const qt = qVal.trim();
    if (qt.length > 0) {
      query.set("q", qt);
    }
    if (sort !== "start") {
      query.set("sort", sort);
    }
    const queryString = query.toString();
    return queryString.length > 0 ? `/competitions?${queryString}` : "/competitions";
  };

  const sortHrefs: Record<CompetitionListSort, string> = {
    start: buildListHref({ sort: "start" }),
    entry_end: buildListHref({ sort: "entry_end" }),
    entries: buildListHref({ sort: "entries" }),
  };
  const viewHrefs = {
    all: buildListHref({ view: "all" }),
    upcoming: buildListHref({ view: "upcoming" }),
    past: buildListHref({ view: "past" }),
  };
  const categoryHrefs = {
    all: buildListHref({ category: "ALL" }),
    byCategory: Object.fromEntries(
      availableCategories.map((c) => [c, buildListHref({ category: c })])
    ) as Record<string, string>,
  };
  const resetHref = buildListHref({
    category: "ALL",
    view: "all",
    q: "",
    sort: "start",
  });
  const getScheduleLabel = (startDate: Date) => {
    const start = new Date(startDate);
    const today = new Date();
    const diffMs = start.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return `あと${diffDays}日`;
    }
    if (diffDays === 0) {
      return "本日開催";
    }
    return "開催済み";
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "下書き";
      case "PUBLISHED":
        return "公開中";
      case "ONGOING":
        return "開催中";
      case "COMPLETED":
        return "終了";
      case "CANCELLED":
        return "中止";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
      case "DRAFT":
        return "border-border bg-muted text-muted-foreground";
      case "ONGOING":
        return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
      case "COMPLETED":
        return "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200";
      case "CANCELLED":
        return "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  };

  const CompetitionCard = ({ competition }: { competition: CompetitionListItem }) => {
    const hostAbbr = competitionHostAbbreviation(competition);
    const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    const isEntryOpen =
      Boolean(entryStart && entryEnd) && now >= (entryStart as Date) && now <= (entryEnd as Date);
    const isEntryUpcoming = Boolean(entryStart) && now < (entryStart as Date);
    const entryStatusLabel = isEntryOpen
      ? "エントリー受付中"
      : isEntryUpcoming
        ? "エントリー準備中"
        : "エントリー終了";
    const entryStatusClass = isEntryOpen
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : isEntryUpcoming
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        : "border-border bg-muted/80 text-muted-foreground";
    const scheduleLabel = getScheduleLabel(competition.startDate);
    const dateRange = formatCompactJaDateRange(competition.startDate, competition.endDate);
    return (
      <Card className="overflow-hidden border-border/80 shadow-sm transition hover:border-primary/30 hover:shadow-md">
        <CardContent className="p-3.5 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="hidden shrink-0 sm:block">
              <OrganizationLogoImage
                key={`${competition.id}-${competition.organization.logoUrl ?? ""}`}
                logoUrl={competition.organization.logoUrl}
                organizationName={competitionHostDisplayName(competition)}
                frameClassName="h-14 w-14 rounded-xl border border-border/60 shadow-sm"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-auto min-w-0 max-w-full justify-start gap-1.5 border-border/90 px-2.5 py-2 text-left text-base font-semibold leading-snug text-foreground shadow-sm hover:bg-muted/60"
                >
                  <Link href={`/competitions/${competition.id}`} className="group inline-flex min-w-0 items-center gap-1">
                    <span className="truncate">{competition.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </Link>
                </Button>
              </div>
              {competition.nameKana ? (
                <p className="truncate text-xs text-muted-foreground">{competition.nameKana}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    getStatusColor(competition.status)
                  )}
                >
                  {getStatusLabel(competition.status)}
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    entryStatusClass
                  )}
                >
                  {entryStatusLabel}
                </span>
                <span className="inline-flex shrink-0 rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {scheduleLabel}
                </span>
                {competition.category ? (
                  <span className="inline-flex shrink-0 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {competition.category}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="tabular-nums text-foreground/90">{dateRange}</span>
                </span>
                <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="truncate">{competition.venue}</span>
                </span>
                <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="truncate">
                    {competitionHostDisplayName(competition)}
                    {hostAbbr ? ` (${hostAbbr})` : ""}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Trophy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              <span className="text-sm font-medium">大会</span>
            </div>
            <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
              大会一覧
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              公開中のライフセービング大会を一覧できます。並び替え・絞り込みで探しやすくしています。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="border border-border/80 px-2.5 py-1 font-normal">
              合計 {totalCount}
            </Badge>
            <Badge
              variant="secondary"
              className="border border-emerald-200/80 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
            >
              予定 {upcomingCount}
            </Badge>
            <Badge
              variant="secondary"
              className="border border-border bg-muted/60 font-normal text-foreground"
            >
              過去 {pastCount}
            </Badge>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-border/80 bg-muted/20 shadow-sm dark:bg-muted/10">
        <div className="p-4">
        <CompetitionsListControls
          sort={sortMode}
          sortHrefs={sortHrefs}
          selectedView={selectedView}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          availableCategories={availableCategories}
          viewHrefs={viewHrefs}
          categoryHrefs={categoryHrefs}
          resetHref={resetHref}
        />
        </div>
      </div>

      {listTruncated ? (
        <p className="mx-auto max-w-6xl px-3 text-xs text-muted-foreground sm:px-5 lg:px-8">
          「すべて」表示では開催予定・過去それぞれ最大 {MAX_BUCKET_ALL_VIEW}{" "}
          件まで読み込みます。絞り込みや「開催予定のみ」「過去のみ」で表示件数を増やせます。
        </p>
      ) : null}

      <div className="space-y-8">
        {visibleUpcomingCompetitions.length > 0 ? (
          <section className="space-y-3" aria-labelledby="comp-upcoming-heading">
            <h2
              id="comp-upcoming-heading"
              className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
            >
              <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
              開催予定
              <Badge variant="outline" className="font-mono text-xs font-normal tabular-nums">
                {visibleUpcomingCompetitions.length}
              </Badge>
            </h2>
            <div className="grid gap-3">
              {visibleUpcomingCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          </section>
        ) : null}

        {visiblePastCompetitions.length > 0 ? (
          <section className="space-y-3" aria-labelledby="comp-past-heading">
            <h2
              id="comp-past-heading"
              className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
            >
              <History className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              過去
              <Badge variant="outline" className="font-mono text-xs font-normal tabular-nums">
                {visiblePastCompetitions.length}
              </Badge>
            </h2>
            <div className="grid gap-3">
              {visiblePastCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          </section>
        ) : null}

        {totalCount === 0 ? (
          <Card className="border-dashed border-border/90 bg-muted/15">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <CalendarRange className="h-6 w-6" strokeWidth={1.25} aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">表示できる大会がありません</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                条件を変えるか、しばらくしてから再度お試しください。
              </p>
            </CardContent>
          </Card>
        ) : null}
        {totalCount > 0 &&
        visibleUpcomingCompetitions.length === 0 &&
        visiblePastCompetitions.length === 0 ? (
          <Card className="border-dashed border-border/90 bg-muted/15">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ListFilter className="h-6 w-6" strokeWidth={1.25} aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">条件に一致する大会がありません</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                絞り込み・キーワード・並び替えを変更してください。
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
