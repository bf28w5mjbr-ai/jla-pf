import { describe, expect, it } from "vitest";
import { validateCompetitionStatusTransition } from "./competitionStatusRules";

describe("competitionStatusRules", () => {
  it("allows unpublish transition from published to draft", () => {
    const result = validateCompetitionStatusTransition("PUBLISHED", "DRAFT");
    expect(result).toEqual({ ok: true });
  });

  it("disallows publishing directly from ongoing", () => {
    const result = validateCompetitionStatusTransition("ONGOING", "PUBLISHED");
    expect(result).toEqual({
      ok: false,
      code: "INVALID_STATUS_TRANSITION",
      message: "ステータス遷移が不正です: ONGOING -> PUBLISHED",
    });
  });
});
