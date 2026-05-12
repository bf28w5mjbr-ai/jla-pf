"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import {
  COMPETITION_MANAGEMENT_TAB_VALUES,
  type CompetitionManagementTabValue,
} from "@/lib/competitionManagementTab";

type Props = {
  /** サーバーが URL の ?tab= から解決した現在タブ */
  activeTab: CompetitionManagementTabValue;
  children: ReactNode;
};

/**
 * タブ切り替えで URL の ?tab= を更新し、ブックマーク・共有・戻る/進むと同期する。
 * 他タブの RSC を事前プリフェッチする。
 *
 * 注: Next 16 + Turbopack では `useTransition` で `router.push` を包むと
 * `Performance.measure` / `__next_root_layout_boundary__` の負のタイムスタンプ例外が出ることがあるため、
 * push は同期的に呼ぶ。
 */
export default function CompetitionManagementTabsClient({
  activeTab,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    for (const tab of COMPETITION_MANAGEMENT_TAB_VALUES) {
      router.prefetch(`${pathname}?tab=${tab}`);
    }
  }, [pathname, router]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => {
        router.push(`${pathname}?tab=${v}`, { scroll: false });
      }}
      className="w-full min-w-0"
    >
      {children}
    </Tabs>
  );
}
