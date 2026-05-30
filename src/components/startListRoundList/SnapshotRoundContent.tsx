"use client";

import { Badge } from "@/components/ui/badge";
import type { PublicHeatResultRoundOverlay } from "@/lib/startListPublicHeatResults";
import {
  formatPublicHeatResultOverlayLabel,
  officialResultRowParticipantKey,
} from "@/lib/startListPublicHeatResults";
import { secondaryClubLabelForTeamRow, secondaryClubLineForIndividual } from "@/lib/startListTeamDisplay";
import type { SnapshotParticipant, SnapshotRoundBlock } from "./types";
import { LaneRow } from "./panelHelpers";

function snapshotParticipantKey(participant: SnapshotParticipant): string | null {
  if (participant.kind === "INDIVIDUAL") {
    return participant.entryId
      ? officialResultRowParticipantKey({
          entryType: "INDIVIDUAL",
          competitionEntryId: participant.entryId,
          teamEntryId: null,
        })
      : null;
  }
  return participant.teamEntryId
    ? officialResultRowParticipantKey({
        entryType: "TEAM",
        competitionEntryId: null,
        teamEntryId: participant.teamEntryId,
      })
    : null;
}

function PublicHeatResultBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="secondary"
      className="ml-auto shrink-0 px-1.5 py-0 text-[10px] font-semibold tabular-nums"
    >
      {label}
    </Badge>
  );
}

export function SnapshotRoundContent({
  eventId,
  roundBlock,
  withdrawnKeySet,
  resultOverlay,
}: {
  eventId: string;
  roundBlock: SnapshotRoundBlock;
  withdrawnKeySet: Set<string>;
  resultOverlay?: PublicHeatResultRoundOverlay | null;
}) {
  const confirmedHeatSet = new Set(resultOverlay?.confirmedHeatIndices ?? []);
  const heatsOrdered = [...roundBlock.heats].sort((a, b) => a.heatIndex - b.heatIndex);
  return (
    <div className="space-y-1.5">
      {heatsOrdered.map((heat) => {
        const heatHasConfirmedResults = confirmedHeatSet.has(heat.heatIndex);
        const visibleParticipants = heat.participants.filter((p) => {
          const participant = p as SnapshotParticipant;
          if (participant.kind !== "INDIVIDUAL") return true;
          const eid = participant.entryId;
          if (!eid) return true;
          return !withdrawnKeySet.has(`${eid}:${eventId}`);
        });
        return (
          <div
            key={`${eventId}-${roundBlock.round}-heat-${heat.heatIndex}`}
            className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-sm leading-snug text-foreground"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground">
                ヒート {heat.heatIndex}（{visibleParticipants.length}件）
              </p>
              {heatHasConfirmedResults ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] font-normal"
                >
                  {resultOverlay?.isFinalized ? "確定結果" : "暫定結果"}
                </Badge>
              ) : null}
            </div>
            <ul className="mt-1 space-y-0.5">
              {visibleParticipants.map((p, index) => {
                const participant = p as SnapshotParticipant;
                const lane = index + 1;
                const participantKey = snapshotParticipantKey(participant);
                const resultRow =
                  heatHasConfirmedResults && participantKey
                    ? resultOverlay?.rowsByKey[participantKey]
                    : undefined;
                const resultLabel = resultRow
                  ? formatPublicHeatResultOverlayLabel(resultRow)
                  : null;
                const laneContentClassName = resultLabel ? "flex items-baseline gap-2" : undefined;
                if (participant.kind === "TEAM") {
                  const clubSecondary = secondaryClubLabelForTeamRow(
                    participant.teamName,
                    participant.clubName
                  );
                  return (
                    <LaneRow key={`team-${heat.heatIndex}-${index}`} laneNumber={lane}>
                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            resultLabel ? "flex items-baseline gap-2" : undefined
                          }
                        >
                          <p className="min-w-0 flex-1 font-medium">
                            {participant.teamName}
                            {clubSecondary ? (
                              <span className="ml-2 text-xs text-gray-500">({clubSecondary})</span>
                            ) : null}
                          </p>
                          {resultLabel ? <PublicHeatResultBadge label={resultLabel} /> : null}
                        </div>
                        {participant.members && participant.members.length > 0 && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {participant.members.join(" / ")}
                          </div>
                        )}
                      </div>
                    </LaneRow>
                  );
                }
                const indClub = secondaryClubLineForIndividual(participant.clubName);
                return (
                  <LaneRow
                    key={`ind-${heat.heatIndex}-${index}`}
                    laneNumber={lane}
                    contentClassName={laneContentClassName}
                  >
                    <span className="min-w-0 flex-1 font-medium">{participant.name}</span>
                    {indClub ? (
                      <span className="text-xs text-muted-foreground">（{indClub}）</span>
                    ) : null}
                    {resultLabel ? <PublicHeatResultBadge label={resultLabel} /> : null}
                  </LaneRow>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
