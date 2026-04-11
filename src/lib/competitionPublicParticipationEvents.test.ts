import { describe, expect, it } from "vitest";
import {
  buildParticipationEventRows,
  buildParticipationEventSections,
  type ParticipationEventAgeCategoryLite,
  type ParticipationEventLite,
} from "./competitionPublicParticipationEvents";

function ev(
  over: Partial<ParticipationEventLite> & Pick<ParticipationEventLite, "id" | "name">
): ParticipationEventLite {
  return {
    sex: "MALE",
    type: "INDIVIDUAL",
    category: "POOL",
    ageCategory: null,
    scheduledStartAt: null,
    ...over,
  };
}

describe("buildParticipationEventRows", () => {
  it("種目名を日本語の読み順で並べる", () => {
    const rows = buildParticipationEventRows([
      ev({ id: "1", name: "100m自由形" }),
      ev({ id: "2", name: "50m自由形" }),
      ev({ id: "3", name: "200m自由形" }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["50m自由形", "100m自由形", "200m自由形"]);
  });
});

describe("buildParticipationEventSections", () => {
  const ageA: ParticipationEventAgeCategoryLite = { id: "a", name: "小学生", displayOrder: 1 };
  const ageB: ParticipationEventAgeCategoryLite = { id: "b", name: "中学生", displayOrder: 2 };

  it("大会の年齢カテゴリ表示順にブロックを並べる", () => {
    const events: ParticipationEventLite[] = [
      ev({ id: "e1", name: "リレー", ageCategory: ageB }),
      ev({ id: "e2", name: "50m", ageCategory: ageA }),
    ];
    const sections = buildParticipationEventSections(events, [ageA, ageB]);
    expect(sections[0]!.ageBlocks.map((b) => b.title)).toEqual(["小学生", "中学生"]);
  });

  it("年齢カテゴリ未設定は最後のブロックになる", () => {
    const events: ParticipationEventLite[] = [
      ev({ id: "u1", name: "一般", ageCategory: null }),
      ev({ id: "e1", name: "50m", ageCategory: ageA }),
    ];
    const sections = buildParticipationEventSections(events, [ageA]);
    expect(sections[0]!.ageBlocks.map((b) => b.title)).toEqual(["小学生", "年齢カテゴリ未設定"]);
  });
});
