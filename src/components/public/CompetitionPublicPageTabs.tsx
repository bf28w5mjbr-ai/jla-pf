"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type TabValue = "overview" | "start-list";

function tabFromSearchParams(sp: URLSearchParams | null): TabValue {
  const raw = sp?.get("tab");
  return raw === "start-list" ? "start-list" : "overview";
}

function CompetitionPublicPageTabsInner({
  competitionId,
  overview,
  startList,
}: {
  competitionId: string;
  overview: ReactNode;
  startList: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = tabFromSearchParams(searchParams);

  const hrefForTab = useCallback(
    (next: TabValue) => {
      const base = `/competitions/${competitionId}`;
      return next === "start-list" ? `${base}?tab=start-list` : base;
    },
    [competitionId]
  );

  const onValueChange = useCallback(
    (next: string) => {
      const v: TabValue = next === "start-list" ? "start-list" : "overview";
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
            "grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 sm:inline-flex sm:w-auto sm:grid-cols-none sm:flex-wrap sm:justify-start"
          )}
          aria-label="大会ページの表示切替"
        >
          <TabsTrigger
            value="overview"
            className="h-9 rounded-lg px-3 text-xs font-medium data-[state=active]:shadow-sm sm:h-8"
          >
            大会ページ
          </TabsTrigger>
          <TabsTrigger
            value="start-list"
            className="h-9 rounded-lg px-3 text-xs font-medium data-[state=active]:shadow-sm sm:h-8"
          >
            スタートリスト
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3 sm:space-y-4">
          {overview}
        </TabsContent>
        <TabsContent value="start-list" className="mt-4 space-y-3 sm:mt-4">
          {startList}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabsFallback({ competitionId }: { competitionId: string }) {
  return (
    <div className="w-full space-y-4" role="status" aria-label="タブを読み込み中">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 sm:inline-flex sm:w-auto">
        <Link
          href={`/competitions/${competitionId}`}
          className="flex h-9 items-center justify-center rounded-lg bg-background px-3 text-xs font-medium text-foreground shadow-sm sm:h-8"
        >
          大会ページ
        </Link>
        <Link
          href={`/competitions/${competitionId}?tab=start-list`}
          className="flex h-9 items-center justify-center rounded-lg px-3 text-xs font-medium text-muted-foreground sm:h-8"
        >
          スタートリスト
        </Link>
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-border/60 bg-muted/40" />
    </div>
  );
}

export default function CompetitionPublicPageTabs({
  competitionId,
  overview,
  startList,
}: {
  competitionId: string;
  overview: ReactNode;
  startList: ReactNode;
}) {
  return (
    <Suspense fallback={<TabsFallback competitionId={competitionId} />}>
      <CompetitionPublicPageTabsInner
        competitionId={competitionId}
        overview={overview}
        startList={startList}
      />
    </Suspense>
  );
}
