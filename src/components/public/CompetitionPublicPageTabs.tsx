"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  parseCompetitionPublicTab,
  type CompetitionPublicTabValue,
} from "@/lib/competitionPublicTab";
import { cn } from "@/lib/utils";

function tabFromSearchParams(sp: URLSearchParams | null): CompetitionPublicTabValue {
  return parseCompetitionPublicTab(sp?.get("tab"));
}

function CompetitionPublicPageTabsInner({
  competitionId,
  detailBasePath,
  overview,
  results,
  variant = "classic",
}: {
  competitionId: string;
  detailBasePath: string;
  overview: ReactNode;
  results: ReactNode;
  variant?: "classic" | "editorial";
}) {
  const isEditorial = variant === "editorial";
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = tabFromSearchParams(searchParams);

  const hrefForTab = useCallback(
    (next: CompetitionPublicTabValue) => {
      if (next === "overview") return detailBasePath;
      return `${detailBasePath}?tab=${next}`;
    },
    [detailBasePath]
  );

  const onValueChange = useCallback(
    (next: string) => {
      const v = parseCompetitionPublicTab(next);
      router.replace(hrefForTab(v), { scroll: false });
    },
    [hrefForTab, router]
  );

  return (
    <div className="w-full space-y-1">
      <p className="sr-only">
        タブを切り替えるとアドレスバーの URL が更新されます。共有やブックマークに利用できます。
      </p>
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList
          className={cn(
            isEditorial
              ? "flex h-auto w-full items-stretch gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-muted/15 p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 sm:inline-flex sm:w-auto sm:grid-cols-none sm:flex-wrap sm:justify-start"
          )}
          aria-label="大会情報の表示切替"
        >
          <TabsTrigger
            value="overview"
            className={cn(
              "rounded-xl px-3 text-xs font-medium transition-all duration-200 sm:text-sm",
              isEditorial
                ? "relative min-w-[7rem] flex-1 py-2.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground sm:min-w-[8rem] data-[state=active]:after:absolute data-[state=active]:after:bottom-1.5 data-[state=active]:after:left-1/2 data-[state=active]:after:h-0.5 data-[state=active]:after:w-10 data-[state=active]:after:-translate-x-1/2 data-[state=active]:after:rounded-full data-[state=active]:after:bg-orange-500/80"
                : "h-9 data-[state=active]:shadow-sm sm:h-8"
            )}
          >
            大会情報
          </TabsTrigger>
          <TabsTrigger
            value="results"
            className={cn(
              "rounded-xl px-3 text-xs font-medium transition-all duration-200 sm:text-sm",
              isEditorial
                ? "relative min-w-[7rem] flex-1 py-2.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground sm:min-w-[8rem] data-[state=active]:after:absolute data-[state=active]:after:bottom-1.5 data-[state=active]:after:left-1/2 data-[state=active]:after:h-0.5 data-[state=active]:after:w-10 data-[state=active]:after:-translate-x-1/2 data-[state=active]:after:rounded-full data-[state=active]:after:bg-orange-500/80"
                : "h-9 data-[state=active]:shadow-sm sm:h-8"
            )}
          >
            レース情報
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className={cn(isEditorial ? "mt-6 space-y-0" : "mt-4 space-y-3 sm:space-y-4")}
        >
          {overview}
        </TabsContent>
        <TabsContent
          value="results"
          className={cn(isEditorial ? "mt-6 space-y-0" : "mt-4 space-y-3 sm:space-y-4")}
        >
          {results}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabsFallback({
  detailBasePath,
  variant = "classic",
}: {
  detailBasePath: string;
  variant?: "classic" | "editorial";
}) {
  const isEditorial = variant === "editorial";
  return (
    <div className="w-full space-y-4" role="status" aria-label="タブを読み込み中">
      <div
        className={cn(
          isEditorial
            ? "grid grid-cols-2 gap-1 rounded-2xl border border-border/55 bg-background/95 p-1.5 shadow-sm"
            : "grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 sm:inline-flex sm:w-auto"
        )}
      >
        <Link
          href={detailBasePath}
          className="flex h-9 items-center justify-center rounded-lg bg-background px-3 text-xs font-medium text-foreground shadow-sm sm:h-8"
        >
          大会情報
        </Link>
        <Link
          href={`${detailBasePath}?tab=results`}
          className="flex h-9 items-center justify-center rounded-lg border border-border/70 bg-muted/40 px-3 text-xs font-medium text-foreground/70 shadow-sm sm:h-8"
        >
          レース情報
        </Link>
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-border/60 bg-muted/40" />
    </div>
  );
}

export default function CompetitionPublicPageTabs({
  competitionId,
  detailBasePath,
  overview,
  results,
  variant = "classic",
}: {
  competitionId: string;
  /** タブ切替・フォールバックリンクのベース（末尾スラッシュなし） */
  detailBasePath: string;
  overview: ReactNode;
  results: ReactNode;
  variant?: "classic" | "editorial";
}) {
  return (
    <Suspense fallback={<TabsFallback detailBasePath={detailBasePath} variant={variant} />}>
      <CompetitionPublicPageTabsInner
        competitionId={competitionId}
        detailBasePath={detailBasePath}
        overview={overview}
        results={results}
        variant={variant}
      />
    </Suspense>
  );
}
