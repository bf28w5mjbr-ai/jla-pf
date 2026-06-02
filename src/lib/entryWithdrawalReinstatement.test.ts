import { describe, expect, it, vi } from "vitest";
import { clearIndividualWithdrawalParticipantStatusesForEvents } from "./entryWithdrawalReinstatement";

describe("clearIndividualWithdrawalParticipantStatusesForEvents", () => {
  it("棄権（WITHDRAWN または legacy DNS+棄権）行を PENDING に戻す updateMany を発行する", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = {
      competitionParticipantStatus: { updateMany },
    };

    await clearIndividualWithdrawalParticipantStatusesForEvents(tx as never, {
      competitionId: "c1",
      competitionEntryId: "e1",
      individualEventIds: ["ev1", "ev1", "ev2"],
      updatedByUserId: "u1",
    });

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        competitionId: "c1",
        eventId: { in: ["ev1", "ev2"] },
        participantType: "INDIVIDUAL",
        competitionEntryId: "e1",
        teamEntryId: null,
        OR: [
          { status: "WITHDRAWN" },
          { status: "DNS", reason: { contains: "棄権" } },
        ],
      },
      data: {
        status: "PENDING",
        reason: null,
        calledAt: null,
        updatedByUserId: "u1",
      },
    });
  });

  it("種目が空なら何もしない", async () => {
    const updateMany = vi.fn();
    const tx = { competitionParticipantStatus: { updateMany } };
    await clearIndividualWithdrawalParticipantStatusesForEvents(tx as never, {
      competitionId: "c1",
      competitionEntryId: "e1",
      individualEventIds: [],
      updatedByUserId: "u1",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
