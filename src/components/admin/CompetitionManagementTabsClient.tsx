"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import type { CompetitionManagementTabValue } from "@/lib/competitionManagementTab";

type Props = {
  /** サーバーが URL の ?tab= から解決した現在タブ */
  activeTab: CompetitionManagementTabValue;
  children: ReactNode;
};

/**
 * タブ切り替えで URL の ?tab= を更新し、ブックマーク・共有・戻る/進むと同期する。
 */
export default function CompetitionManagementTabsClient({
  activeTab,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      key={activeTab}
      defaultValue={activeTab}
      onValueChange={(v) => {
        router.push(`${pathname}?tab=${v}`, { scroll: false });
      }}
      className="w-full min-w-0"
    >
      {children}
    </Tabs>
  );
}
