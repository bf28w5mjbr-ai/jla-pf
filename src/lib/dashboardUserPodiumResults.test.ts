import { describe, expect, it } from "vitest";
import { officialResultPublicVisibilityWhere } from "@/lib/officialResultPublicVisibility";
import { userPodiumResultRowWhere } from "@/lib/dashboardUserPodiumResults";

describe("userPodiumResultRowWhere", () => {
  it("決勝1〜3位・OK・公開済み公式結果・個人/チームの OR", () => {
    const userId = "user-1";
    expect(userPodiumResultRowWhere(userId)).toEqual({
      rank: { gte: 1, lte: 3 },
      status: "OK",
      advanceWithoutRank: false,
      OR: [
        { competitionEntry: { userId } },
        { teamEntry: { members: { some: { userId } } } },
      ],
      officialResult: {
        round: "FINAL",
        ...officialResultPublicVisibilityWhere(),
      },
    });
  });
});
