import Link from "next/link";
import { Building2, Calendar, ChevronRight, MapPin } from "lucide-react";
import { HomeMarqueeCta } from "@/components/home/HomeMarqueeCta";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { OrganizationLogoImage } from "@/components/OrganizationLogoImage";
import { Card, CardContent } from "@/components/ui/card";
import {
  competitionHostAbbreviation,
  competitionHostDisplayName,
} from "@/lib/competitionHostDisplay";
import { formatCompactJaDateRange } from "@/lib/datetimeLocal";
import type { HomeFeaturedCompetition } from "@/lib/homeFeaturedContent";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";

type Props = {
  competitions: HomeFeaturedCompetition[];
  categories: string[];
};

function getScheduleLabel(startDate: Date) {
  const start = new Date(startDate);
  const today = new Date();
  const diffMs = start.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `あと${diffDays}日`;
  if (diffDays === 0) return "本日開催";
  return "開催済み";
}

function CompetitionShowcaseCard({ competition }: { competition: HomeFeaturedCompetition }) {
  const hostName = competitionHostDisplayName(competition);
  const hostAbbr = competitionHostAbbreviation(competition);
  const dateRange = formatCompactJaDateRange(competition.startDate, competition.endDate);
  const scheduleLabel = getScheduleLabel(competition.startDate);

  return (
    <Card className="h-full min-w-[16rem] max-w-[18rem] shrink-0 snap-start overflow-hidden border-border/80 shadow-sm transition hover:border-primary/30 hover:shadow-md sm:min-w-[18rem]">
      <CardContent className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-start gap-3">
          <OrganizationLogoImage
            logoUrl={competition.organization.logoUrl}
            organizationName={hostName}
            frameClassName="h-14 w-14 shrink-0 rounded-2xl border border-border/60 shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <Link
              href={appRoutes.public.competitionView(competition.id)}
              className="group line-clamp-2 text-sm font-semibold leading-snug text-foreground hover:text-primary"
            >
              {competition.name}
            </Link>
            {competition.category ? (
              <span className="mt-1.5 inline-flex rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-foreground">
                {competition.category}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-auto space-y-2">
          <span className="inline-flex rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
            {scheduleLabel}
          </span>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="tabular-nums text-foreground/90">{dateRange}</span>
            </span>
            {competition.venue ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{competition.venue}</span>
              </span>
            ) : null}
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Building2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">
                {hostName}
                {hostAbbr ? ` (${hostAbbr})` : ""}
              </span>
            </span>
          </div>
          <Link
            href={appRoutes.public.competitionView(competition.id)}
            className="group mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            詳細を見る
            <ChevronRight
              className="size-3.5 transition group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function HomeCompetitionsShowcase({ competitions, categories }: Props) {
  if (competitions.length === 0) return null;

  const listHref = appRoutes.public.competitions();

  return (
    <section className="w-full py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl px-4 sm:max-w-4xl lg:max-w-5xl">
        <HomeSectionHeading label="Competitions" title="開催予定の大会" />
        {categories.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={listHref}
              className={cn(
                "inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/15"
              )}
            >
              すべて
            </Link>
            {categories.map((category) => (
              <Link
                key={category}
                href={`${listHref}?category=${encodeURIComponent(category)}`}
                className="inline-flex rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary/25 hover:bg-muted/70"
              >
                {category}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto overscroll-x-contain px-4 pb-2 [-webkit-overflow-scrolling:touch] sm:px-6">
        <ul className="flex w-max gap-4 snap-x snap-mandatory">
          {competitions.map((competition) => (
            <li key={competition.id}>
              <CompetitionShowcaseCard competition={competition} />
            </li>
          ))}
        </ul>
      </div>

      <HomeMarqueeCta href={listHref} label="もっと大会を見る" className="mt-8" />
    </section>
  );
}
