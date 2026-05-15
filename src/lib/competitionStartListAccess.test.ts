import { describe, expect, it } from "vitest";
import {
  canEditCompetitionPublishedSchedule,
  canManageCompetitionStartListSettings,
  canToggleCompetitionStartListVisibility,
} from "./competitionStartListAccess";

describe("competitionStartListAccess", () => {
  describe("canToggleCompetitionStartListVisibility", () => {
    it("org ADMIN のみ true", () => {
      expect(
        canToggleCompetitionStartListVisibility({
          orgAdminsForCurrentUser: [{ role: "ADMIN" }],
        })
      ).toBe(true);
    });

    it("org MEMBER は false", () => {
      expect(
        canToggleCompetitionStartListVisibility({
          orgAdminsForCurrentUser: [{ role: "MEMBER" }],
        })
      ).toBe(false);
    });

    it("所属なしは false", () => {
      expect(
        canToggleCompetitionStartListVisibility({
          orgAdminsForCurrentUser: [],
        })
      ).toBe(false);
    });

    it("canEditCompetitionPublishedSchedule と同じ", () => {
      const admins = [{ role: "MEMBER" as const }];
      expect(canToggleCompetitionStartListVisibility({ orgAdminsForCurrentUser: admins })).toBe(
        canEditCompetitionPublishedSchedule({ orgAdminsForCurrentUser: admins })
      );
    });
  });

  describe("canManageCompetitionStartListSettings", () => {
    it("当日運用アンロックのみでは公開切替は不可（別関数）", () => {
      expect(
        canToggleCompetitionStartListVisibility({
          orgAdminsForCurrentUser: [],
        })
      ).toBe(false);
      expect(
        canManageCompetitionStartListSettings({
          orgAdminsForCurrentUser: [],
          hasDayOpsUnlock: true,
        })
      ).toBe(true);
    });
  });
});
