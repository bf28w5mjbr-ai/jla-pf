import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { HomeClubLogo } from "@/components/home/HomeClubLogo";
import { HomeMarqueeCta } from "@/components/home/HomeMarqueeCta";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { Card, CardContent } from "@/components/ui/card";
import { clubPublicLocationLabel, clubPublicTypeLabel } from "@/lib/clubPublicFields";
import type { HomeFeaturedClub } from "@/lib/homeFeaturedContent";
import { appRoutes } from "@/lib/appRoutes";

type Props = {
  clubs: HomeFeaturedClub[];
};

export function HomeClubsShowcase({ clubs }: Props) {
  if (clubs.length === 0) return null;

  const listHref = appRoutes.public.clubs();

  return (
    <section className="w-full py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl px-4 sm:max-w-4xl lg:max-w-5xl">
        <HomeSectionHeading label="Clubs" title="クラブを探す" />
      </div>

      <div className="mt-6 overflow-x-auto overscroll-x-contain px-4 pb-2 [-webkit-overflow-scrolling:touch] sm:px-6">
        <ul className="flex w-max gap-4 snap-x snap-mandatory">
          {clubs.map((club) => {
            const location = clubPublicLocationLabel(club);
            const typeLabel = clubPublicTypeLabel(club);
            const displayName = club.abbreviation?.trim() || club.name;

            return (
              <li key={club.id}>
                <Card className="h-full min-w-[14rem] max-w-[16rem] shrink-0 snap-start overflow-hidden border-border/80 shadow-sm transition hover:border-primary/30 hover:shadow-md sm:min-w-[15rem]">
                  <CardContent className="flex h-full flex-col items-center p-5 text-center">
                    <HomeClubLogo name={club.name} logoUrl={club.logoUrl} />
                    <Link
                      href={appRoutes.public.clubView(club.id)}
                      className="group mt-4 line-clamp-2 text-sm font-semibold leading-snug text-foreground hover:text-primary"
                    >
                      {displayName}
                    </Link>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{typeLabel}</p>
                    {location ? (
                      <p className="mt-2 inline-flex max-w-full items-center justify-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3 shrink-0 opacity-80" aria-hidden />
                        <span className="truncate">{location}</span>
                      </p>
                    ) : null}
                    <Link
                      href={appRoutes.public.clubView(club.id)}
                      className="group mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
                    >
                      詳細
                      <ChevronRight
                        className="size-3.5 transition group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <HomeMarqueeCta href={listHref} label="クラブ一覧を見る" className="mt-8" />
    </section>
  );
}
