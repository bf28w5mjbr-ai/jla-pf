"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OfficialSubTabValue } from "@/lib/competitionManagementTab";

type Props = {
  officialSub: OfficialSubTabValue;
  /** カード等（内側に `TabsContent` を含む想定） */
  children: ReactNode;
};

/**
 * オフィシャル用の Radix `Tabs` ルート。`TabsList` は子（カード）より上＝カード外に置く。
 * `TabsContent` は子のサーバーコンポーネント側で描画する。
 * クリック直後に見た目を切り替えるため `pendingSub` を使い、`useTransition` は使わない。
 */
export default function CompetitionOfficialSubTabsClient({
  officialSub,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingSub, setPendingSub] = useState<OfficialSubTabValue | null>(null);

  const displaySub = pendingSub ?? officialSub;

  useEffect(() => {
    setPendingSub(null);
  }, [officialSub]);

  useEffect(() => {
    router.prefetch(`${pathname}?tab=official&officialSub=manage`);
    router.prefetch(`${pathname}?tab=official&officialSub=dayops`);
  }, [pathname, router]);

  return (
    <Tabs
      value={displaySub}
      onValueChange={(v) => {
        if (v === "manage" || v === "dayops") {
          setPendingSub(v);
          router.push(`${pathname}?tab=official&officialSub=${v}`, { scroll: false });
        }
      }}
      className="w-full min-w-0 space-y-4"
    >
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="manage">管理</TabsTrigger>
        <TabsTrigger value="dayops">当日運用</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}
