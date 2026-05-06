import { describe, expect, it, vi } from "vitest";
import { syncTechnicalOfficialAssignmentFromOfficialApplication } from "@/lib/syncTechnicalOfficialAssignmentFromOfficialApplication";

function makeTx() {
  return {
    competitionTechnicalOfficialAssignment: {
      deleteMany: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("syncTechnicalOfficialAssignmentFromOfficialApplication", () => {
  it("GENERAL: deletes only assignments without invitation", async () => {
    const tx = makeTx();
    await syncTechnicalOfficialAssignmentFromOfficialApplication(tx as never, {
      competitionId: "c1",
      userId: "u1",
      entryType: "GENERAL",
      clubId: "club-any",
    });
    expect(tx.competitionTechnicalOfficialAssignment.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.competitionTechnicalOfficialAssignment.deleteMany).toHaveBeenCalledWith({
      where: { competitionId: "c1", userId: "u1", invitationId: null },
    });
    expect(tx.competitionTechnicalOfficialAssignment.upsert).not.toHaveBeenCalled();
  });

  it("TECHNICAL: deletes other clubs for same user/competition then upserts", async () => {
    const tx = makeTx();
    await syncTechnicalOfficialAssignmentFromOfficialApplication(tx as never, {
      competitionId: "c1",
      userId: "u1",
      entryType: "TECHNICAL",
      clubId: "clubB",
    });
    expect(tx.competitionTechnicalOfficialAssignment.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.competitionTechnicalOfficialAssignment.deleteMany).toHaveBeenCalledWith({
      where: { competitionId: "c1", userId: "u1", clubId: { not: "clubB" } },
    });
    expect(tx.competitionTechnicalOfficialAssignment.upsert).toHaveBeenCalledTimes(1);
    expect(tx.competitionTechnicalOfficialAssignment.upsert).toHaveBeenCalledWith({
      where: {
        competitionId_clubId_userId: { competitionId: "c1", clubId: "clubB", userId: "u1" },
      },
      create: {
        competitionId: "c1",
        clubId: "clubB",
        userId: "u1",
        invitationId: null,
      },
      update: {},
    });
  });

  it("TECHNICAL with empty clubId: no-op", async () => {
    const tx = makeTx();
    await syncTechnicalOfficialAssignmentFromOfficialApplication(tx as never, {
      competitionId: "c1",
      userId: "u1",
      entryType: "TECHNICAL",
      clubId: "",
    });
    expect(tx.competitionTechnicalOfficialAssignment.deleteMany).not.toHaveBeenCalled();
    expect(tx.competitionTechnicalOfficialAssignment.upsert).not.toHaveBeenCalled();
  });
});
