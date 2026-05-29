"use client";

import StartListEventPublicCard from "@/components/StartListEventPublicCard";
import StartListEventOpsCard from "@/components/StartListEventOpsCard";
import { useStartListPeriodicSync } from "@/hooks/useStartListPeriodicSync";
import type { StartListEventCardProps } from "@/lib/startListEventTypes";
import { resolveStartListPeriodicSyncIntervalSec } from "@/lib/startListPeriodicSync";

export type { StartListMarshalViewMode } from "@/lib/startListEventTypes";

export default function StartListEventUnifiedCard(props: StartListEventCardProps) {
  const intervalSec =
    props.periodicSyncIntervalSec ?? props.softRefreshIntervalSec ?? undefined;

  useStartListPeriodicSync({
    competitionId: props.competitionId,
    enabled: props.periodicSyncEnabled !== false,
    snapshotSync: props.periodicSnapshotSync !== false,
    intervalSec: intervalSec ?? resolveStartListPeriodicSyncIntervalSec(),
  });

  if (props.viewMode === "public") {
    return <StartListEventPublicCard {...props} />;
  }
  return <StartListEventOpsCard {...props} />;
}
