"use client";

import { Badge } from "@/components/ui/badge";
import type { PublicHeatResultRoundOverlay } from "@/lib/startListPublicHeatResults";
import {
  formatPublicHeatResultOverlayLabel,
  officialResultRowParticipantKey,
  publicHeatResultOverlayKey,
  sortSnapshotParticipantEntriesForConfirmedOverlay,
} from "@/lib/startListPublicHeatResults";
import { secondaryClubLabelForTeamRow } from "@/lib/startListTeamDisplay";
import type { SnapshotParticipant, SnapshotRoundBlock } from "./types";
import { individualLiveRowLabel, LaneRow } from "./panelHelpers";

const resultRowWrapClass =
  "flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5";

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
        const filteredParticipants = heat.participants
          .map((p, snapshotIndex) => ({ p, snapshotIndex }))
          .filter(({ p }) => {
            const participant = p as SnapshotParticipant;
            if (participant.kind !== "INDIVIDUAL") return true;
            const eid = participant.entryId;
            if (!eid) return true;
            return !withdrawnKeySet.has(`${eid}:${eventId}`);
          });
        const visibleParticipants =
          heatHasConfirmedResults && resultOverlay
            ? sortSnapshotParticipantEntriesForConfirmedOverlay(
                filteredParticipants.map(({ p, snapshotIndex }) => ({
                  participant: p,
                  snapshotIndex,
                })),
                heat.heatIndex,
                resultOverlay,
                (p) => snapshotParticipantKey(p as SnapshotParticipant)
              )
            : filteredParticipants.map(({ p }) => p);
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
                    ? resultOverlay?.rowsByKey[
                        publicHeatResultOverlayKey(heat.heatIndex, participantKey)
                      ]
                    : undefined;
                const resultLabel = resultRow
                  ? formatPublicHeatResultOverlayLabel(resultRow)
                  : null;
                if (participant.kind === "TEAM") {
                  const clubSecondary = secondaryClubLabelForTeamRow(
                    participant.teamName,
                    participant.clubName
                  );
                  return (
                    <LaneRow key={`team-${heat.heatIndex}-${index}`} laneNumber={lane}>
                      <div className="min-w-0 flex-1">
                        <div className={resultLabel ? resultRowWrapClass : undefined}>
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
                return (
                  <LaneRow key={`ind-${heat.heatIndex}-${index}`} laneNumber={lane}>
                    <div className={resultLabel ? resultRowWrapClass : undefined}>
                      <div className="min-w-0 flex-1">
                        {individualLiveRowLabel(participant.name, participant.clubName)}
                      </div>
                      {resultLabel ? <PublicHeatResultBadge label={resultLabel} /> : null}
                    </div>
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
