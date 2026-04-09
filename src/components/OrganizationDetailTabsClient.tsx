"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import type { OrganizationDetailTabValue } from "@/lib/organizationDetailTab";

type Props = {
  activeTab: OrganizationDetailTabValue;
  children: ReactNode;
};

/**
 * タブ切り替えで URL の ?tab= を更新し、ブックマーク・共有・履歴と同期する。
 */
export default function OrganizationDetailTabsClient({
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
        const sp = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : ""
        );
        sp.set("tab", v);
        const q = sp.toString();
        router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }}
      className="w-full min-w-0"
    >
      {children}
    </Tabs>
  );
}
