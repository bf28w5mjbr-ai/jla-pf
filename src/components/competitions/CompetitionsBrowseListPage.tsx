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
import { Badge } from "@/components/ui/badge";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import {
  competitionHostAbbreviation,
  competitionHostDisplayName,
} from "@/lib/competitionHostDisplay";
import { OrganizationLogoImage } from "@/components/OrganizationLogoImage";
import {
  CompetitionsListControls,
  type CompetitionListSort,
} from "@/components/competitions/CompetitionsListControls";
import {
  buildEntryStatusLabel,
  entryStatusBadgeClass,
} from "@/lib/competitionEntryStatusDisplay";
import { formatCompactJaDateRange } from "@/lib/datetimeLocal";
import { cn } from "@/lib/utils";

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

type CompetitionsBrowseListSearchParams = {
  category?: string;
  view?: string;
  q?: string;
  sort?: string;
};

type Props = {
  layout?: "classic" | "editorial";
  listBasePath: string;
  competitionDetailHref: (competitionId: string) => string;
  searchParams: Promise<CompetitionsBrowseListSearchParams>;
};

function CompetitionListSubheading({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function CompetitionEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CalendarRange;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-muted/15 px-5 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
        <Icon className="size-6" strokeWidth={1.25} aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export async function CompetitionsBrowseListPage({
  layout = "classic",
  listBasePath,
  competitionDetailHref,
  searchParams,
}: Props) {
  const isEditorial = layout === "editorial";
  const params = await searchParams;
  const categoryFilter = isEditorial ? undefined : params.category;
  const selectedCategory =
    categoryFilter && categoryFilter !== "ALL" ? categoryFilter : "ALL";
  const viewParam = isEditorial ? undefined : params.view;
  const selectedView =
    viewParam === "upcoming" || viewParam === "past" ? viewParam : "all";
  const searchQuery = isEditorial ? "" : (params.q ?? "").trim();
  const sortParam = isEditorial ? undefined : params.sort;
  const sortMode: CompetitionListSort = isEditorial
    ? "start"
    : sortParam === "entry_end" || sortParam === "entries"
      ? sortParam
      : "start";

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
    return queryString.length > 0 ? `${listBasePath}?${queryString}` : listBasePath;
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
  const CompetitionCard = ({ competition }: { competition: CompetitionListItem }) => {
    const hostAbbr = competitionHostAbbreviation(competition);
    const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
    const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
    const entryStatus = buildEntryStatusLabel(now, entryStart, entryEnd);
    const entryStatusLabel = entryStatus.label;
    const entryStatusClass = entryStatusBadgeClass(entryStatus.tone);
    const dateRange = formatCompactJaDateRange(competition.startDate, competition.endDate);
    return (
      <Link
        href={competitionDetailHref(competition.id)}
        className={cn(
          "group relative block overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-4 py-4 sm:px-5 sm:py-5",
          "transition-[border-color,background-color,box-shadow] duration-200",
          "hover:border-orange-200/70 hover:bg-orange-50/20 hover:shadow-sm",
          "dark:hover:border-orange-900/45 dark:hover:bg-orange-950/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-orange-500/6 dark:bg-orange-400/5"
          aria-hidden
        />
        <div
          className="absolute bottom-4 left-0 top-4 w-0.5 rounded-full bg-gradient-to-b from-orange-500/60 via-orange-400/25 to-transparent sm:bottom-5 sm:top-5"
          aria-hidden
        />
        <div className="relative flex items-start gap-4 pl-2 sm:gap-5 sm:pl-3">
          <div className="hidden shrink-0 sm:block">
            <OrganizationLogoImage
              key={`${competition.id}-${competition.organization.logoUrl ?? ""}`}
              logoUrl={competition.organization.logoUrl}
              organizationName={competitionHostDisplayName(competition)}
              frameClassName="h-28 w-28 shrink-0 rounded-2xl border border-border/60 shadow-sm"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-balance text-base font-semibold leading-snug text-foreground sm:text-lg">
                  {competition.name}
                </p>
                {competition.nameKana ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{competition.nameKana}</p>
                ) : null}
              </div>
              <ChevronRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  entryStatusClass
                )}
              >
                {entryStatusLabel}
              </span>
              {competition.category ? (
                <span className="inline-flex shrink-0 rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                  {competition.category}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="tabular-nums text-foreground/90">{dateRange}</span>
              </span>
              <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{competition.venue}</span>
              </span>
              <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">
                  {competitionHostDisplayName(competition)}
                  {hostAbbr ? ` (${hostAbbr})` : ""}
                </span>
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  const controlsPanel = (
    <div className="rounded-2xl border border-border/55 bg-muted/20 px-4 py-4 shadow-sm dark:bg-muted/10 sm:px-5">
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
  );

  const listContent = (
    <>
      {listTruncated ? (
        <p className="text-xs text-muted-foreground">
          {isEditorial
            ? "一部の大会のみ表示しています。"
            : `「すべて」表示では開催予定・過去それぞれ最大 ${MAX_BUCKET_ALL_VIEW} 件まで読み込みます。絞り込みや「開催予定のみ」「過去のみ」で表示件数を増やせます。`}
        </p>
      ) : null}

      <div className={cn(isEditorial ? "space-y-3" : "space-y-8")}>
        {isEditorial &&
        (visibleUpcomingCompetitions.length > 0 || visiblePastCompetitions.length > 0) ? (
          <div className="grid gap-3">
            {visibleUpcomingCompetitions.map((competition) => (
              <CompetitionCard key={competition.id} competition={competition} />
            ))}
            {visiblePastCompetitions.map((competition) => (
              <CompetitionCard key={competition.id} competition={competition} />
            ))}
          </div>
        ) : null}

        {!isEditorial && visibleUpcomingCompetitions.length > 0 ? (
          <section className="space-y-4" aria-labelledby="comp-upcoming-heading">
            <h2
              id="comp-upcoming-heading"
              className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
            >
              <Sparkles className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
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

        {!isEditorial && visiblePastCompetitions.length > 0 ? (
          <section className="space-y-4" aria-labelledby="comp-past-heading">
            <h2
              id="comp-past-heading"
              className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
            >
              <History className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
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
          <CompetitionEmptyState
            icon={CalendarRange}
            title="表示できる大会がありません"
            description="条件を変えるか、しばらくしてから再度お試しください。"
          />
        ) : null}
        {totalCount > 0 &&
        visibleUpcomingCompetitions.length === 0 &&
        visiblePastCompetitions.length === 0 ? (
          <CompetitionEmptyState
            icon={ListFilter}
            title="条件に一致する大会がありません"
            description="絞り込み・キーワード・並び替えを変更してください。"
          />
        ) : null}
      </div>
    </>
  );

  if (isEditorial) {
    return (
      <div className="flex flex-col">
        <h1 className="sr-only">大会一覧</h1>

        <section
          className={cn(
            dashboardSectionClassName,
            "border-b border-border/40 pb-10 pt-10 sm:pb-14 sm:pt-12"
          )}
        >
          <CompetitionListSubheading>Competitions</CompetitionListSubheading>
          <h2 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            大会一覧
          </h2>
        </section>

        <section
          className={cn(dashboardSectionClassName, "space-y-6 pb-16 pt-10 sm:pb-20 sm:pt-12")}
        >
          {listContent}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Trophy className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium">大会</span>
          </div>
          <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            大会一覧
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            公開中のライフセービング大会を一覧できます。並び替え・絞り込みで探しやすくしています。
          </p>
        </div>
      </header>

      {controlsPanel}
      {listContent}
    </div>
  );
}
