import { describe, expect, it } from "vitest";
import { partitionUnderAgeBands } from "./competitionUnderAgeSystem";
import {
  applyEntryQualificationToggleWithCertifiedMacro,
  compactCertifiedLifesaverExpandedQualifications,
  deriveEntryQualificationOptionsFromTemplates,
  ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
  isQualificationRelaxedMulti,
  isQualificationTighteningMulti,
  normalizeEntryRequiredQualifications,
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
  parseUnderFeeTiers,
  parseUnderQualificationTiers,
  pickTierForAge,
  resolveEntryFeeUnits,
  resolveRequiredQualificationsForAge,
  validateAgeTiersNoOverlap,
} from "./competitionEntryAgeTiered";

describe("competitionEntryAgeTiered", () => {
  it("picks fee tier by inclusive age bounds", () => {
    const tiers = [
      { minAge: 6, maxAge: 12, individualEntryFee: 1000, teamEntryFeePerTeam: 2000 },
      { minAge: 13, maxAge: null, individualEntryFee: 3000, teamEntryFeePerTeam: 4000 },
    ];
    expect(pickTierForAge(tiers, 12)?.individualEntryFee).toBe(1000);
    expect(pickTierForAge(tiers, 13)?.individualEntryFee).toBe(3000);
    expect(pickTierForAge(tiers, 99)?.teamEntryFeePerTeam).toBe(4000);
  });

  it("resolveEntryFeeUnits uses flat config when no ageFeeTiers", () => {
    const r = resolveEntryFeeUnits(
      { individualEntryFee: 5000, teamEntryFeePerTeam: 8000 },
      null
    );
    expect(r.tiered).toBe(false);
    expect(r.individualUnit).toBe(5000);
    expect(r.teamUnit).toBe(8000);
    expect(r.ageTierMissing).toBe(false);
  });

  it("resolveEntryFeeUnits requires age for tiered fees", () => {
    const fee = { ageFeeTiers: [{ minAge: 0, maxAge: null, individualEntryFee: 1, teamEntryFeePerTeam: 2 }] };
    expect(parseAgeFeeTiers(fee)).not.toBeNull();
    const noAge = resolveEntryFeeUnits(fee, null);
    expect(noAge.ageTierMissing).toBe(true);
    const ok = resolveEntryFeeUnits(fee, 40);
    expect(ok.ageTierMissing).toBe(false);
    expect(ok.individualUnit).toBe(1);
  });

  it("resolveEntryFeeUnits resolves age category tiers by birth date", () => {
    const from = new Date(Date.UTC(2010, 0, 1));
    const to = new Date(Date.UTC(2015, 11, 31));
    const fee = {
      ageCategoryFeeTiers: [
        { ageCategoryId: "c-jr", individualEntryFee: 1000, teamEntryFeePerTeam: 2000 },
        { ageCategoryId: "c-sr", individualEntryFee: 3000, teamEntryFeePerTeam: 4000 },
      ],
    };
    expect(parseAgeCategoryFeeTiers(fee)).not.toBeNull();
    const dob = new Date(Date.UTC(2012, 5, 15));
    const cats = [
      { id: "c-sr", displayOrder: 2, eligibleBirthDateFrom: from, eligibleBirthDateTo: to },
      { id: "c-jr", displayOrder: 1, eligibleBirthDateFrom: from, eligibleBirthDateTo: to },
    ];
    const r = resolveEntryFeeUnits(fee, 99, {
      userDateOfBirth: dob,
      competitionAgeCategories: cats,
    });
    expect(r.ageTierMissing).toBe(false);
    expect(r.individualUnit).toBe(1000);
    expect(r.teamUnit).toBe(2000);
  });

  it("resolveEntryFeeUnits category tiers need date of birth", () => {
    const fee = {
      ageCategoryFeeTiers: [
        { ageCategoryId: "c1", individualEntryFee: 1, teamEntryFeePerTeam: 2 },
      ],
    };
    const r = resolveEntryFeeUnits(fee, 40, {
      userDateOfBirth: null,
      competitionAgeCategories: [
        {
          id: "c1",
          displayOrder: 0,
          eligibleBirthDateFrom: new Date(Date.UTC(2000, 0, 1)),
          eligibleBirthDateTo: new Date(Date.UTC(2030, 0, 1)),
        },
      ],
    });
    expect(r.ageTierMissing).toBe(true);
  });

  it("detects qualification tightening across ages", () => {
    const oldFlat = ["選手登録"];
    const newFlat: string[] = [];
    expect(isQualificationTighteningMulti(oldFlat, newFlat)).toBe(false);
    expect(isQualificationRelaxedMulti(oldFlat, newFlat)).toBe(true);

    expect(isQualificationTighteningMulti(newFlat, oldFlat)).toBe(true);
  });

  it("tiered qualifications resolve per age", () => {
    const raw = {
      ageQualificationTiers: [
        { minAge: 0, maxAge: 14, requiredQualifications: [] as string[] },
        { minAge: 15, maxAge: null, requiredQualifications: ["選手登録"] },
      ],
    };
    expect(resolveRequiredQualificationsForAge(raw, 10).list).toEqual([]);
    expect(resolveRequiredQualificationsForAge(raw, 15).list).toEqual(["選手登録"]);
  });

  it("validateAgeTiersNoOverlap rejects overlapping ranges", () => {
    expect(
      validateAgeTiersNoOverlap([
        { minAge: 0, maxAge: 10 },
        { minAge: 10, maxAge: 20 },
      ])
    ).toContain("重複");
    expect(
      validateAgeTiersNoOverlap([
        { minAge: 0, maxAge: 10 },
        { minAge: 11, maxAge: 20 },
      ])
    ).toBeNull();
  });

  const underPartition = partitionUnderAgeBands([15, 10], true);

  it("parseUnderFeeTiers と resolveEntryFeeUnits でアンダー区分別料金を解決する", () => {
    const fee = {
      underFeeTiers: [
        { tierKey: "U-10", individualEntryFee: 1000, teamEntryFeePerTeam: 2000 },
        { tierKey: "U-15", individualEntryFee: 3000, teamEntryFeePerTeam: 4000 },
        { tierKey: "OPEN", individualEntryFee: 5000, teamEntryFeePerTeam: 6000 },
      ],
    };
    expect(parseUnderFeeTiers(fee)?.length).toBe(3);
    expect(resolveEntryFeeUnits(fee, 9, { underFeePartition: underPartition }).individualUnit).toBe(1000);
    expect(resolveEntryFeeUnits(fee, 12, { underFeePartition: underPartition }).teamUnit).toBe(4000);
    expect(resolveEntryFeeUnits(fee, 20, { underFeePartition: underPartition }).individualUnit).toBe(5000);
  });

  it("アンダー別料金は年度年齢なし・帯外は ageTierMissing", () => {
    const fee = {
      underFeeTiers: [
        { tierKey: "U-10", individualEntryFee: 1, teamEntryFeePerTeam: 2 },
        { tierKey: "U-15", individualEntryFee: 3, teamEntryFeePerTeam: 4 },
        { tierKey: "OPEN", individualEntryFee: 5, teamEntryFeePerTeam: 6 },
      ],
    };
    expect(resolveEntryFeeUnits(fee, null, { underFeePartition: underPartition }).ageTierMissing).toBe(true);
    const closed = partitionUnderAgeBands([15, 10], false);
    expect(resolveEntryFeeUnits(fee, 16, { underFeePartition: closed }).ageTierMissing).toBe(true);
  });

  it("parseUnderQualificationTiers と resolveRequiredQualificationsForAge でアンダー別資格を解決する", () => {
    const raw = {
      underQualificationTiers: [
        { tierKey: "U-10", requiredQualifications: [] as string[] },
        { tierKey: "U-15", requiredQualifications: ["選手登録"] },
        { tierKey: "OPEN", requiredQualifications: ["選手登録", "BLS・WS"] },
      ],
    };
    expect(parseUnderQualificationTiers(raw)?.length).toBe(3);
    expect(resolveRequiredQualificationsForAge(raw, 10, { underPartition }).list).toEqual([]);
    expect(resolveRequiredQualificationsForAge(raw, 12, { underPartition }).list).toEqual(["選手登録"]);
    expect(resolveRequiredQualificationsForAge(raw, 18, { underPartition }).list).toEqual([
      "選手登録",
      "BLS・WS",
    ]);
  });

  it("アンダー別資格は OPEN オフで帯外なら tierMissing", () => {
    const raw = {
      underQualificationTiers: [
        { tierKey: "U-10", requiredQualifications: [] },
        { tierKey: "U-15", requiredQualifications: ["選手登録"] },
      ],
    };
    const closed = partitionUnderAgeBands([15, 10], false);
    expect(resolveRequiredQualificationsForAge(raw, 16, { underPartition: closed }).tierMissing).toBe(true);
  });

  it("テンプレート由来の資格候補に認定LSマクロを先頭追加する", () => {
    const options = deriveEntryQualificationOptionsFromTemplates([
      { id: "t1", name: "ベーシック・サーフライフセーバー", kind: "ベーシック・サーフライフセーバー" },
      { id: "t2", name: "IRBクルー", kind: "IRBクルー" },
      { id: "t3", name: "IRBクルー", kind: "IRBクルー" },
    ]);
    expect(options[0]).toBe(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
    expect(options).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "ベーシック・サーフライフセーバー",
      "IRBクルー",
    ]);
  });

  it("認定LSマクロ選択で上位資格を展開保存できる", () => {
    const options = [
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "ベーシック・サーフライフセーバー",
      "プールライフガード",
      "IRBクルー",
    ];
    const expanded = normalizeEntryRequiredQualifications([ENTRY_REQUIRED_CERTIFIED_LIFESAVER], {
      allowedQualifications: new Set(options),
      expandCertifiedLifesaverMacro: true,
    });
    expect(expanded).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "ベーシック・サーフライフセーバー",
      "プールライフガード",
      "IRBクルー",
    ]);
    expect(compactCertifiedLifesaverExpandedQualifications(expanded)).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
    ]);
  });

  it("認定LSマクロがある場合は上位資格を評価集合から圧縮する", () => {
    const raw = [
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "ベーシック・サーフライフセーバー",
      "IRBクルー",
    ];
    expect(resolveRequiredQualificationsForAge(raw, 20).list).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
    ]);
  });

  it("認定LSトグルで上位資格を一括選択・解除できる", () => {
    const options = [
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "ベーシック・サーフライフセーバー",
      "プールライフガード",
      "IRBクルー",
    ];
    const selected = applyEntryQualificationToggleWithCertifiedMacro([], ENTRY_REQUIRED_CERTIFIED_LIFESAVER, options);
    expect(selected).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "ベーシック・サーフライフセーバー",
      "プールライフガード",
      "IRBクルー",
    ]);
    const removed = applyEntryQualificationToggleWithCertifiedMacro(
      selected,
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      options
    );
    expect(removed).toEqual([]);
  });

  it("テンプレート外資格は正規化で除外できる", () => {
    const normalized = normalizeEntryRequiredQualifications(
      ["認定ライフセーバー", "IRBクルー", "未知の資格"],
      {
        allowedQualifications: new Set(["認定ライフセーバー", "IRBクルー"]),
        expandCertifiedLifesaverMacro: true,
      }
    );
    expect(normalized).toEqual(["認定ライフセーバー", "IRBクルー"]);
  });
});
