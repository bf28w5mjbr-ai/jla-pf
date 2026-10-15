import { describe, expect, it } from "vitest";
import {
  COMPETITION_QUALIFICATION_AS_OF_TIME_ZONE,
  COMPETITION_START_DATE_AS_QUALIFICATION_AS_OF_APPROVED,
  competitionQualificationAsOfCalendarDay,
  declaredKindsMeetEntryRequirements,
  qualificationExpiryCoversCompetitionFirstDay,
  qualificationKindMatchesRequirement,
  qualificationMeetsCompetitionRequirementConfirmation,
  qualificationRequirementConfirmationLabel,
  resolveCompetitionQualificationAsOfDate,
  QUALIFICATION_DECLARED_FOR_ENTRY_STATUSES,
} from "./qualificationEntryEligibility";
import {
  isActiveOfficialConfirmation,
  QUALIFICATION_CONFIRMATION_METHOD_REVIEW,
  QUALIFICATION_REQUIREMENTS_PENDING_LABEL,
  QUALIFICATION_REQUIREMENTS_VERIFIED_LABEL,
} from "./qualificationOwnerRules";

const asOf = new Date("2026-06-01T00:00:00.000Z");
const completeHeld = {
  kind: "BLS・WS",
  status: "APPROVED",
  templateId: "tmpl_bls",
  certNumber: "C-1",
  expiryDate: new Date("2027-01-01T00:00:00.000Z"),
  confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
  confirmationInvalidatedAt: null,
  confirmedTemplateId: "tmpl_bls",
  confirmedCertNumber: "C-1",
  confirmedExpiryDate: new Date("2027-01-01T00:00:00.000Z"),
  confirmedByUserId: "jla-admin",
  confirmedByAssociationId: "assoc_jla",
  confirmationMethod: QUALIFICATION_CONFIRMATION_METHOD_REVIEW,
};

describe("declaredKindsMeetEntryRequirements", () => {
  it("要件なしは常に満たす（期限拒否をしない）", () => {
    expect(declaredKindsMeetEntryRequirements([], [])).toBe(true);
    expect(declaredKindsMeetEntryRequirements(["BLS"], [])).toBe(true);
  });

  it("PENDING と APPROVED の申告 kind を同等に認める", () => {
    expect(declaredKindsMeetEntryRequirements(["BLS・WS"], ["BLS・WS"])).toBe(true);
    expect(qualificationKindMatchesRequirement("bls ws", "BLS・WS")).toBe(true);
  });

  it("不足 kind は満たさない", () => {
    expect(declaredKindsMeetEntryRequirements(["BLS・WS"], ["認定ライフセーバー"])).toBe(false);
  });

  it("エントリー申告ステータスは PENDING と APPROVED のみ", () => {
    expect([...QUALIFICATION_DECLARED_FOR_ENTRY_STATUSES]).toEqual(["PENDING", "APPROVED"]);
  });
});

describe("qualificationRequirementConfirmationLabel", () => {
  it("要件なしはラベルなし", () => {
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: [],
        qualifications: [completeHeld],
        competitionAsOfDate: asOf,
      })
    ).toBeNull();
  });

  it("申告のみは待ち。保有確認と大会要件確認を区別する", () => {
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [
          {
            ...completeHeld,
            status: "PENDING",
            confirmedAt: null,
            confirmedByUserId: null,
            confirmedByAssociationId: null,
            confirmationMethod: null,
            confirmedTemplateId: null,
            confirmedCertNumber: null,
            confirmedExpiryDate: null,
          },
        ],
        competitionAsOfDate: asOf,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);

    expect(isActiveOfficialConfirmation(completeHeld)).toBe(true);
    expect(
      qualificationMeetsCompetitionRequirementConfirmation({
        qualification: completeHeld,
        requiredKind: "BLS・WS",
        competitionAsOfDate: asOf,
      })
    ).toBe(true);
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [completeHeld],
        competitionAsOfDate: asOf,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_VERIFIED_LABEL);
  });

  it("不完全な確認根拠では大会要件を確認済みにしない", () => {
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [{ ...completeHeld, confirmedByAssociationId: null }],
        competitionAsOfDate: asOf,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);
  });

  it("スナップショット不一致では大会要件を確認済みにしない", () => {
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [{ ...completeHeld, confirmedCertNumber: "OTHER" }],
        competitionAsOfDate: asOf,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);
  });

  it("期限不明では資格要件確認済みと断定しない", () => {
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [
          {
            ...completeHeld,
            expiryDate: null,
            confirmedExpiryDate: null,
          },
        ],
        competitionAsOfDate: asOf,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);
    expect(isActiveOfficialConfirmation({ ...completeHeld, expiryDate: null, confirmedExpiryDate: null })).toBe(
      true
    );
  });

  it("大会の基準日未確定では資格要件確認済みと断定しない", () => {
    expect(resolveCompetitionQualificationAsOfDate()).toBeNull();
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [completeHeld],
        competitionAsOfDate: null,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);
  });

  it("開催日があれば基準日は開催初日（終了日は使わない）", () => {
    const startDate = new Date("2026-08-01T00:00:00.000Z");
    const endDate = new Date("2026-08-03T00:00:00.000Z");
    expect(COMPETITION_START_DATE_AS_QUALIFICATION_AS_OF_APPROVED).toBe(true);
    expect(COMPETITION_QUALIFICATION_AS_OF_TIME_ZONE).toBe("Asia/Tokyo");
    const asOf = resolveCompetitionQualificationAsOfDate({
      competitionStartDate: startDate,
      competitionEndDate: endDate,
    });
    expect(asOf?.toISOString()).toBe(startDate.toISOString());
    expect(competitionQualificationAsOfCalendarDay(asOf)).toBe("2026-08-01");
    expect(
      resolveCompetitionQualificationAsOfDate({
        competitionStartDate: startDate,
        startDatePolicyApproved: false,
      })
    ).toBeNull();
  });

  it("申込受付ゲートは期限で拒否しない", () => {
    expect(declaredKindsMeetEntryRequirements(["BLS・WS"], ["BLS・WS"])).toBe(true);
  });

  it("無効化済み確認は確認済みにしない", () => {
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [
          {
            ...completeHeld,
            confirmationInvalidatedAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        ],
        competitionAsOfDate: asOf,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);
  });
});

describe("qualificationExpiryCoversCompetitionFirstDay", () => {
  const startUtcMidnight = new Date("2026-08-01T00:00:00.000Z");
  const startJstMidnight = new Date("2026-08-01T00:00:00+09:00");
  const startJstEvening = new Date("2026-08-01T22:00:00+09:00");
  const endDate = new Date("2026-08-05T00:00:00.000Z");

  function confirmedAt(expiry: Date) {
    return {
      ...completeHeld,
      expiryDate: expiry,
      confirmedExpiryDate: expiry,
    };
  }

  it("前日失効は開催初日まで有効としない", () => {
    const expiry = new Date("2026-07-31T00:00:00+09:00");
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: expiry,
        competitionStartDate: startJstMidnight,
      })
    ).toBe(false);
    expect(
      qualificationMeetsCompetitionRequirementConfirmation({
        qualification: confirmedAt(expiry),
        requiredKind: "BLS・WS",
        competitionAsOfDate: startUtcMidnight,
      })
    ).toBe(false);
  });

  it("有効期限が初日と同日なら有効（UTC 保存と JST 真夜中の時刻差でも）", () => {
    const expiryUtcDateOnly = new Date("2026-08-01T00:00:00.000Z");
    const expiryJstMidnight = new Date("2026-08-01T00:00:00+09:00");
    expect(expiryJstMidnight.getTime()).toBeLessThan(startUtcMidnight.getTime());
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: expiryJstMidnight,
        competitionStartDate: startUtcMidnight,
      })
    ).toBe(true);
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: expiryUtcDateOnly,
        competitionStartDate: startJstEvening,
      })
    ).toBe(true);
    expect(
      qualificationMeetsCompetitionRequirementConfirmation({
        qualification: confirmedAt(expiryJstMidnight),
        requiredKind: "BLS・WS",
        competitionAsOfDate: resolveCompetitionQualificationAsOfDate({
          competitionStartDate: startUtcMidnight,
        }),
      })
    ).toBe(true);
  });

  it("翌日以降まで有効なら開催初日まで有効", () => {
    const expiry = new Date("2026-08-02T00:00:00+09:00");
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: expiry,
        competitionStartDate: startJstMidnight,
      })
    ).toBe(true);
  });

  it("期限不明は開催初日まで有効と断定しない", () => {
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: null,
        competitionStartDate: startUtcMidnight,
      })
    ).toBe(false);
    expect(
      qualificationRequirementConfirmationLabel({
        requiredKinds: ["BLS・WS"],
        qualifications: [
          {
            ...completeHeld,
            expiryDate: null,
            confirmedExpiryDate: null,
          },
        ],
        competitionAsOfDate: startUtcMidnight,
      })
    ).toBe(QUALIFICATION_REQUIREMENTS_PENDING_LABEL);
  });

  it("複数日大会でも基準は初日であり終了日ではない", () => {
    const expiryFirstDay = new Date("2026-08-01T00:00:00+09:00");
    const asOf = resolveCompetitionQualificationAsOfDate({
      competitionStartDate: startUtcMidnight,
      competitionEndDate: endDate,
    });
    expect(competitionQualificationAsOfCalendarDay(asOf)).toBe("2026-08-01");
    expect(competitionQualificationAsOfCalendarDay(endDate)).toBe("2026-08-05");
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: expiryFirstDay,
        competitionStartDate: asOf,
      })
    ).toBe(true);
    expect(
      qualificationExpiryCoversCompetitionFirstDay({
        expiryDate: expiryFirstDay,
        competitionStartDate: endDate,
      })
    ).toBe(false);
    expect(
      qualificationMeetsCompetitionRequirementConfirmation({
        qualification: confirmedAt(expiryFirstDay),
        requiredKind: "BLS・WS",
        competitionAsOfDate: asOf,
      })
    ).toBe(true);
  });
});
