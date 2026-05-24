"use client";

import { secondaryClubLabelForTeamRow, secondaryClubLineForIndividual } from "@/lib/startListTeamDisplay";
import type { SnapshotParticipant, SnapshotRoundBlock } from "./types";
import { LaneRow } from "./panelHelpers";

export function SnapshotRoundContent({
  eventId,
  roundBlock,
  withdrawnKeySet,
}: {
  eventId: string;
  roundBlock: SnapshotRoundBlock;
  withdrawnKeySet: Set<string>;
}) {
  const heatsOrdered = [...roundBlock.heats].sort((a, b) => a.heatIndex - b.heatIndex);
  return (
    <div className="space-y-1.5">
      {heatsOrdered.map((heat) => {
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
            <p className="text-xs font-semibold text-muted-foreground">
              ヒート {heat.heatIndex}（{visibleParticipants.length}件）
            </p>
            <ul className="mt-1 space-y-0.5">
              {visibleParticipants.map((p, index) => {
                const participant = p as SnapshotParticipant;
                const lane = index + 1;
                if (participant.kind === "TEAM") {
                  const clubSecondary = secondaryClubLabelForTeamRow(
                    participant.teamName,
                    participant.clubName
                  );
                  return (
                    <LaneRow key={`team-${heat.heatIndex}-${index}`} laneNumber={lane}>
                      <p className="font-medium">
                        {participant.teamName}
                        {clubSecondary ? (
                          <span className="ml-2 text-xs text-gray-500">({clubSecondary})</span>
                        ) : null}
                      </p>
                      {participant.members && participant.members.length > 0 && (
                        <div className="mt-0.5 text-xs text-gray-500">
                          {participant.members.join(" / ")}
                        </div>
                      )}
                    </LaneRow>
                  );
                }
                const indClub = secondaryClubLineForIndividual(participant.clubName);
                return (
                  <LaneRow key={`ind-${heat.heatIndex}-${index}`} laneNumber={lane}>
                    <span className="font-medium">{participant.name}</span>
                    {indClub ? (
                      <span className="ml-2 text-xs text-muted-foreground">（{indClub}）</span>
                    ) : null}
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
