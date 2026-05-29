import { describe, expect, it } from "vitest";
import {
  buildWithdrawableEventOptions,
  filterIndividualEventIdsFromEntry,
  hasSelectableWithdrawEvents,
  parseWithdrawEventIds,
  resolveWithdrawProcessingEventIds,
  resolveWithdrawTargetEventIds,
} from "./entryWithdrawalRequest";

describe("parseWithdrawEventIds", () => {
  it("非空の eventIds を重複除去して返す", () => {
    const result = parseWithdrawEventIds({ eventIds: ["a", "a", " b "] });
    expect(result).toEqual({ ok: true, eventIds: ["a", "b"] });
  });

  it("空配列はエラー", () => {
    expect(parseWithdrawEventIds({ eventIds: [] }).ok).toBe(false);
    expect(parseWithdrawEventIds({}).ok).toBe(false);
  });
});

describe("filterIndividualEventIdsFromEntry", () => {
  it("個人種目のみ残す", () => {
    const map = new Map([
      ["e1", "INDIVIDUAL"],
      ["e2", "TEAM"],
    ]);
    expect(
      filterIndividualEventIdsFromEntry(
        [{ eventId: "e1" }, { eventId: "e2" }, { eventId: "e1" }],
        map
      )
    ).toEqual(["e1"]);
  });
});

describe("resolveWithdrawTargetEventIds", () => {
  it("許可外の ID は拒否", () => {
    const result = resolveWithdrawTargetEventIds({
      requestedEventIds: ["e1", "e9"],
      allowedIndividualEventIds: ["e1", "e2"],
    });
    expect(result.ok).toBe(false);
  });
});

describe("resolveWithdrawProcessingEventIds", () => {
  const statuses = [
    { eventId: "e1", status: "DNS", reason: "棄権（DNS扱い）" },
    { eventId: "e2", status: "PENDING", reason: null },
  ];

  it("棄権済みを除き未処理種目のみ返す", () => {
    const result = resolveWithdrawProcessingEventIds({
      targetEventIds: ["e1", "e2"],
      participantStatuses: statuses,
      startListSettings: {},
    });
    expect(result).toEqual({ ok: true, eventIds: ["e2"] });
  });

  it("召集締切済みはエラー", () => {
    const result = resolveWithdrawProcessingEventIds({
      targetEventIds: ["e2"],
      participantStatuses: statuses,
      startListSettings: { dayOpsCallClosedEventIds: ["e2"] },
      eventLabelById: new Map([["e2", "200m"]]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("200m");
    }
  });

  it("すべて棄権済みならエラー", () => {
    const result = resolveWithdrawProcessingEventIds({
      targetEventIds: ["e1"],
      participantStatuses: statuses,
      startListSettings: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildWithdrawableEventOptions", () => {
  it("選択可能種目の有無を判定できる", () => {
    const options = buildWithdrawableEventOptions({
      individualEventIds: ["e1", "e2"],
      eventLabelById: new Map([
        ["e1", "100m"],
        ["e2", "200m"],
      ]),
      participantStatuses: [{ eventId: "e1", status: "DNS", reason: "棄権" }],
      startListSettings: { dayOpsCallClosedEventIds: ["e2"] },
    });
    expect(options[0]?.alreadyWithdrawn).toBe(true);
    expect(options[1]?.callClosed).toBe(true);
    expect(hasSelectableWithdrawEvents(options)).toBe(false);
  });
});
