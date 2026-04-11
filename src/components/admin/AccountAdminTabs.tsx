"use client";

import { useState } from "react";
import { Landmark, Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AccountAdminTabValue = "association" | "host";

export default function AccountAdminTabs({
  initialTab,
  associationContent,
  hostContent,
}: {
  initialTab: AccountAdminTabValue;
  associationContent: React.ReactNode;
  hostContent: React.ReactNode;
}) {
  const [tab, setTab] = useState<AccountAdminTabValue>(initialTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as AccountAdminTabValue)}
      className="w-full"
    >
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/80 bg-muted/35 p-1">
        <TabsTrigger
          value="association"
          className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-base"
        >
          <Landmark className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          協会
        </TabsTrigger>
        <TabsTrigger
          value="host"
          className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-base"
        >
          <Trophy className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          大会主催者
        </TabsTrigger>
      </TabsList>
      <TabsContent value="association" className="mt-5 space-y-8 focus-visible:outline-none sm:mt-7 sm:space-y-10">
        {associationContent}
      </TabsContent>
      <TabsContent value="host" className="mt-5 space-y-8 focus-visible:outline-none sm:mt-7 sm:space-y-10">
        {hostContent}
      </TabsContent>
    </Tabs>
  );
}
