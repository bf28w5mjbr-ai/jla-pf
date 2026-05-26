"use client";

import StartListEventPublicCard from "@/components/StartListEventPublicCard";
import StartListEventOpsCard from "@/components/StartListEventOpsCard";
import type { StartListEventCardProps } from "@/lib/startListEventTypes";

export type { StartListMarshalViewMode } from "@/lib/startListEventTypes";

export default function StartListEventUnifiedCard(props: StartListEventCardProps) {
  if (props.viewMode === "public") {
    return <StartListEventPublicCard {...props} />;
  }
  return <StartListEventOpsCard {...props} />;
}
