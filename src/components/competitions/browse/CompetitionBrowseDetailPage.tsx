import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import type { CompetitionPublicTabValue } from "@/lib/competitionPublicTab";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { cn } from "@/lib/utils";
import { CompetitionPublicHeaderLoader } from "./CompetitionPublicHeaderLoader";
import { CompetitionPublicTabsLoader } from "./CompetitionPublicTabsLoader";
import {
  CompetitionPublicHeaderSkeleton,
  CompetitionPublicPageTabsSkeleton,
} from "./CompetitionPublicPageSkeleton";

type Props = {
  layout?: "classic" | "editorial";
  competitionId: string;
  activeTab: CompetitionPublicTabValue;
  detailBasePath: string;
};

export function CompetitionBrowseDetailPage({
  layout = "classic",
  competitionId,
  activeTab,
  detailBasePath,
}: Props) {
  const isEditorial = layout === "editorial";

  if (isEditorial) {
    return (
      <div className="flex flex-col">
        <section
          className={cn(
            dashboardSectionClassName,
            "border-b border-border/40 pb-0 pt-10 sm:pt-12"
          )}
        >
          <Link
            href="/competitions"
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-1.5 text-sm text-muted-foreground",
              "transition-colors hover:border-border/60 hover:bg-muted/30 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <ArrowLeft
              className="size-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden
            />
            大会一覧に戻る
          </Link>
        </section>

        <section
          className={cn(
            dashboardSectionClassName,
            "border-b border-border/40 pb-10 pt-8 sm:pb-14 sm:pt-10"
          )}
        >
          <Suspense fallback={<CompetitionPublicHeaderSkeleton layout="editorial" />}>
            <CompetitionPublicHeaderLoader competitionId={competitionId} layout="editorial" />
          </Suspense>
        </section>

        <section
          className={cn(dashboardSectionClassName, "pb-16 pt-10 sm:pb-20 sm:pt-12")}
        >
          <Suspense
            fallback={
              <CompetitionPublicPageTabsSkeleton
                competitionId={competitionId}
                detailBasePath={detailBasePath}
                layout="editorial"
              />
            }
          >
            <CompetitionPublicTabsLoader
              competitionId={competitionId}
              activeTab={activeTab}
              detailBasePath={detailBasePath}
              layout="editorial"
            />
          </Suspense>
        </section>
      </div>
    );
  }

  return (
    <div className="app-page mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      <Suspense fallback={<CompetitionPublicHeaderSkeleton />}>
        <CompetitionPublicHeaderLoader competitionId={competitionId} />
      </Suspense>
      <Suspense
        fallback={
          <CompetitionPublicPageTabsSkeleton
            competitionId={competitionId}
            detailBasePath={detailBasePath}
          />
        }
      >
        <CompetitionPublicTabsLoader
          competitionId={competitionId}
          activeTab={activeTab}
          detailBasePath={detailBasePath}
        />
      </Suspense>
    </div>
  );
}
