import Link from "next/link";
import { ArrowRight, Building2, Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { competitionHostAbbreviation } from "@/lib/competitionHostDisplay";
import { formatCompactJaDateRange } from "@/lib/datetimeLocal";
import type { HomeFeaturedCompetition } from "@/lib/homeFeaturedContent";
import { appRoutes } from "@/lib/appRoutes";

type Props = {
  competitions: HomeFeaturedCompetition[];
};

export function HomeFeaturedCompetitions({ competitions }: Props) {
  if (competitions.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="home-featured-competitions-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2
          id="home-featured-competitions-heading"
          className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          開催予定の大会
        </h2>
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-muted-foreground">
          <Link href={appRoutes.public.competitions()}>
            すべて見る
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
      <ul className="space-y-3">
        {competitions.map((competition) => {
          const hostAbbr = competitionHostAbbreviation(competition);
          const dateRange = formatCompactJaDateRange(
            competition.startDate,
            competition.endDate
          );
          return (
            <li key={competition.id}>
              <Card className="overflow-hidden border-border/80 shadow-sm transition hover:border-primary/30 hover:shadow-md">
                <CardContent className="p-4">
                  <Link
                    href={appRoutes.public.competitionView(competition.id)}
                    className="group block space-y-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-base font-semibold leading-snug text-foreground group-hover:text-primary">
                        {competition.name}
                      </span>
                      <ArrowRight
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                        aria-hidden
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="size-3.5 shrink-0 opacity-80" aria-hidden />
                        <span className="tabular-nums text-foreground/90">{dateRange}</span>
                      </span>
                      {competition.venue ? (
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="truncate">{competition.venue}</span>
                        </span>
                      ) : null}
                      {hostAbbr ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
                          <span>{hostAbbr}</span>
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
