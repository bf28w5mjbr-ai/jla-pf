"use client";

import dynamic from "next/dynamic";
import StartListEventPublicCard from "@/components/StartListEventPublicCard";
import { useStartListPeriodicSync } from "@/hooks/useStartListPeriodicSync";
import type { StartListEventCardProps } from "@/lib/startListEventTypes";
import {
  resolveStartListPeriodicSyncIntervalSec,
  resolveStartListPublicRefreshIntervalSec,
} from "@/lib/startListPeriodicSync";

const StartListEventOpsCard = dynamic(() => import("@/components/StartListEventOpsCard"), {
  loading: () => (
    <div
      className="flex min-h-[12rem] items-center justify-center rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      運用向けスタートリストを読み込んでいます…
    </div>
  ),
});

export type { StartListMarshalViewMode } from "@/lib/startListEventTypes";

export default function StartListEventUnifiedCard(props: StartListEventCardProps) {
  const isPublic = props.viewMode === "public";
  const intervalSec =
    props.periodicSyncIntervalSec ??
    props.softRefreshIntervalSec ??
    (isPublic
      ? resolveStartListPublicRefreshIntervalSec()
      : resolveStartListPeriodicSyncIntervalSec());

  useStartListPeriodicSync({
    competitionId: props.competitionId,
    enabled: props.periodicSyncEnabled !== false,
    snapshotSync: !isPublic && props.periodicSnapshotSync !== false,
    intervalSec,
  });

  if (isPublic) {
    return <StartListEventPublicCard {...props} />;
  }
  return <StartListEventOpsCard {...props} />;
}
