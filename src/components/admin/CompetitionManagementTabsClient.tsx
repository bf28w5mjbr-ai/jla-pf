"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsTrigger } from "@/components/ui/tabs";
import {
  type CompetitionManagementTabValue,
} from "@/lib/competitionManagementTab";

type Props = {
  /** サーバーが URL の ?tab= から解決した現在タブ */
  activeTab: CompetitionManagementTabValue;
  children: ReactNode;
};

/**
 * タブ切り替えで URL の ?tab= を更新し、ブックマーク・共有・戻る/進むと同期する。
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

type TabTriggerProps = {
  value: CompetitionManagementTabValue;
  className?: string;
  children: ReactNode;
};

/** ホバー時のみ prefetch（全タブ一括 prefetch は重い RSC を連発するため廃止） */
export function CompetitionManagementTabTrigger({
  value,
  className,
  children,
}: TabTriggerProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <TabsTrigger
      value={value}
      className={className}
      onPointerEnter={() => {
        router.prefetch(`${pathname}?tab=${value}`);
      }}
    >
      {children}
    </TabsTrigger>
  );
}
