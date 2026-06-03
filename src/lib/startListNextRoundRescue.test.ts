/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { reconcileNextRoundMarshalAfterRescueRegenerate } from "@/lib/startListNextRoundRescue";
import type { StartListSnapshotPayload } from "@/lib/startListSnapshot";

const { mockExpandTeam } = vi.hoisted(() => ({
  mockExpandTeam: vi.fn(),
}));

vi.mock("@/lib/teamMarshalExpand", () => ({
  expandTeamMarshalRefsWithMembers: mockExpandTeam,
}));

function makeTx() {
  const participantStatuses = new Map<string, Record<string, unknown>>();
  let heatStates: Array<{ heatIndex: number; callClosedAt: Date | null }> = [];

  return {
    participantStatuses,
    tx: {
      competitionParticipantStatus: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const key = JSON.stringify(where);
          const row = participantStatuses.get(key);
          return row ? { id: row.id } : null;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          for (const [k, row] of participantStatuses.entries()) {
            if (row.id === where.id) {
              participantStatuses.set(k, { ...row, ...data });
            }
          }
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = `ps-${participantStatuses.size + 1}`;
          participantStatuses.set(JSON.stringify(data), { ...data, id });
        }),
        findMany: vi.fn(async () =>
          [...participantStatuses.values()].map((row) => ({
            id: row.id,
            participantType: row.participantType,
            competitionEntryId: row.competitionEntryId,
            teamEntryId: row.teamEntryId,
            teamMemberUserId: row.teamMemberUserId,
          }))
        ),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          for (const [k, row] of participantStatuses.entries()) {
            if (row.id === where.id) participantStatuses.delete(k);
          }
        }),
      },
      competitionHeatMarshalState: {
        deleteMany: vi.fn(async () => {
          heatStates = [];
        }),
        upsert: vi.fn(
          async ({
            where,
            create,
          }: {
            where: { competitionId_eventId_round_heatIndex: { heatIndex: number } };
            create: { callClosedAt: Date | null };
          }) => {
            heatStates.push({
              heatIndex: where.competitionId_eventId_round_heatIndex.heatIndex,
              callClosedAt: create.callClosedAt,
            });
          }
        ),
      },
    },
    getHeatStates: () => heatStates,
  };
}

describe("reconcileNextRoundMarshalAfterRescueRegenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExpandTeam.mockImplementation(async (_tx, refs: unknown[]) => refs);
  });

  it("仍が進出者の CALLED を維持し、全員完了ヒートに締切を再付与", async () => {
    const { tx, getHeatStates } = makeTx();
    const priorClose = new Date("2026-06-01T10:00:00.000Z");

    const snapshot: StartListSnapshotPayload = {
      version: 1,
      capturedAt: new Date().toISOString(),
      events: [
        {
          eventId: "e1",
          name: "Test",
          sex: "MALE",
          type: "INDIVIDUAL",
          rounds: [
            {
              round: "SEMI",
              generatedAt: new Date().toISOString(),
              generatedBy: "RESULT_BASED",
              heats: [
                {
                  heatIndex: 1,
                  participants: [
                    {
                      kind: "INDIVIDUAL",
                      entryId: "ent1",
                      userId: "u1",
                      name: "A",
                      clubId: null,
                      clubName: null,
                    },
                    {
                      kind: "INDIVIDUAL",
                      entryId: "ent2",
                      userId: "u2",
                      name: "B",
                      clubId: null,
                      clubName: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const statusBefore = new Map([
      [
        "I:ent1",
        {
          participantType: "INDIVIDUAL" as const,
          competitionEntryId: "ent1",
          teamEntryId: null,
          teamMemberUserId: null,
          status: "CALLED",
          calledAt: priorClose,
          reason: null,
        },
      ],
      [
        "I:ent2",
        {
          participantType: "INDIVIDUAL" as const,
          competitionEntryId: "ent2",
          teamEntryId: null,
          teamMemberUserId: null,
          status: "PENDING",
          calledAt: null,
          reason: null,
        },
      ],
    ]);

    await reconcileNextRoundMarshalAfterRescueRegenerate(tx as never, {
      competitionId: "c1",
      eventId: "e1",
      toRound: "SEMI",
      snapshot,
      statusBefore,
      maxPriorHeatCloseAt: priorClose,
      operatorUserId: "op1",
      now: new Date("2026-06-01T11:00:00.000Z"),
    });

    expect(tx.competitionParticipantStatus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          competitionEntryId: "ent1",
          status: "CALLED",
        }),
      })
    );
    expect(getHeatStates()).toEqual([]);
  });

  it("全スロット CALLED/終了系のヒートは callClosedAt を再付与", async () => {
    const { tx, getHeatStates } = makeTx();
    const priorClose = new Date("2026-06-01T10:00:00.000Z");

    const snapshot: StartListSnapshotPayload = {
      version: 1,
      capturedAt: new Date().toISOString(),
      events: [
        {
          eventId: "e1",
          name: "Test",
          sex: "MALE",
          type: "INDIVIDUAL",
          rounds: [
            {
              round: "SEMI",
              generatedAt: new Date().toISOString(),
              generatedBy: "RESULT_BASED",
              heats: [
                {
                  heatIndex: 1,
                  participants: [
                    {
                      kind: "INDIVIDUAL",
                      entryId: "ent1",
                      userId: "u1",
                      name: "A",
                      clubId: null,
                      clubName: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const statusBefore = new Map([
      [
        "I:ent1",
        {
          participantType: "INDIVIDUAL" as const,
          competitionEntryId: "ent1",
          teamEntryId: null,
          teamMemberUserId: null,
          status: "CALLED",
          calledAt: priorClose,
          reason: null,
        },
      ],
    ]);

    await reconcileNextRoundMarshalAfterRescueRegenerate(tx as never, {
      competitionId: "c1",
      eventId: "e1",
      toRound: "SEMI",
      snapshot,
      statusBefore,
      maxPriorHeatCloseAt: priorClose,
      operatorUserId: null,
      now: new Date("2026-06-01T11:00:00.000Z"),
    });

    expect(getHeatStates()).toEqual([{ heatIndex: 1, callClosedAt: priorClose }]);
  });
});
