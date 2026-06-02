import { describe, expect, it } from "vitest";
import {
  foldTeamMemberStatuses,
  isCalledLikeStatus,
  isTeamFullyCalled,
} from "@/lib/dayOpsTeamStatus";

describe("dayOpsTeamStatus", () => {
  it("foldTeamMemberStatuses は DSQ を最優先する", () => {
    expect(foldTeamMemberStatuses(["CALLED", "DSQ", "PENDING"])).toBe("DSQ");
  });

  it("foldTeamMemberStatuses は WITHDRAWN を維持する", () => {
    expect(foldTeamMemberStatuses(["WITHDRAWN", "PENDING"])).toBe("WITHDRAWN");
  });

  it("foldTeamMemberStatuses は DNS を返す", () => {
    expect(foldTeamMemberStatuses(["DNS", "PENDING"])).toBe("DNS");
  });

  it("foldTeamMemberStatuses は DNF を DSQ より下位で返す", () => {
    expect(foldTeamMemberStatuses(["DNF", "DSQ"])).toBe("DSQ");
    expect(foldTeamMemberStatuses(["DNF", "PENDING"])).toBe("DNF");
  });

  it("foldTeamMemberStatuses は CALLED/CHECKED_IN のみなら CALLED", () => {
    expect(foldTeamMemberStatuses(["CALLED", "CHECKED_IN"])).toBe("CALLED");
  });

  it("isTeamFullyCalled は CHECKED_IN を召集済み相当として扱う", () => {
    expect(isTeamFullyCalled(["CALLED", "CHECKED_IN"])).toBe(true);
    expect(isTeamFullyCalled(["CALLED", "PENDING"])).toBe(false);
  });

  it("isCalledLikeStatus は CALLED/CHECKED_IN のみ true", () => {
    expect(isCalledLikeStatus("CALLED")).toBe(true);
    expect(isCalledLikeStatus("CHECKED_IN")).toBe(true);
    expect(isCalledLikeStatus("PENDING")).toBe(false);
  });
});
