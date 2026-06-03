import { describe, expect, it } from "vitest";
import {
  applyEntryQualificationToggleWithCertifiedMacro,
  compactCertifiedLifesaverExpandedQualifications,
  deriveEntryQualificationOptionsFromTemplates,
  ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
  hasLegacyAgeBandEntryFee,
  hasLegacyAgeBandQualifications,
  isQualificationRelaxedByAgeCategory,
  isQualificationRelaxedMulti,
  isQualificationTighteningByAgeCategory,
  isQualificationTighteningMulti,
  maxIndividualEntryFeeUnitAcrossTiers,
  normalizeEntryRequiredQualifications,
  parseAgeCategoryFeeTiers,
  parseAgeCategoryQualificationTiers,
  parseAgeFeeTiers,
  pickAgeCategoryIdForBirthDate,
  pickTierForAge,
  resolveEntryFeeUnits,
  resolveRequiredQualificationsForAge,
  resolveRequiredQualificationsForAgeCategory,
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

  describe("legacy age bands (ageFeeTiers / ageQualificationTiers)", () => {
    it("resolveEntryFeeUnits requires age for tiered fees", () => {
      const fee = { ageFeeTiers: [{ minAge: 0, maxAge: null, individualEntryFee: 1, teamEntryFeePerTeam: 2 }] };
      expect(parseAgeFeeTiers(fee)).not.toBeNull();
      const noAge = resolveEntryFeeUnits(fee, null);
      expect(noAge.ageTierMissing).toBe(true);
      const ok = resolveEntryFeeUnits(fee, 40);
      expect(ok.ageTierMissing).toBe(false);
      expect(ok.individualUnit).toBe(1);
    });

    it("hasLegacyAgeBandEntryFee / hasLegacyAgeBandQualifications", () => {
      expect(hasLegacyAgeBandEntryFee({ ageFeeTiers: [{ minAge: 0, maxAge: null, individualEntryFee: 1, teamEntryFeePerTeam: 2 }] })).toBe(true);
      expect(hasLegacyAgeBandEntryFee({ ageCategoryFeeTiers: [{ ageCategoryId: "a", individualEntryFee: 1, teamEntryFeePerTeam: 2 }] })).toBe(false);
      expect(hasLegacyAgeBandQualifications({ ageQualificationTiers: [{ minAge: 0, maxAge: null, requiredQualifications: ["選手登録"] }] })).toBe(true);
      expect(hasLegacyAgeBandQualifications(["選手登録"])).toBe(false);
    });
  });

  it("片側のみの生年月日上限でも pickAgeCategoryId で参加費・資格のカテゴリが一致して解決する", () => {
    const to = new Date(Date.UTC(2015, 11, 31));
    const cats = [
      { id: "cat-open", displayOrder: 1, eligibleBirthDateFrom: null, eligibleBirthDateTo: to },
    ];
    const dob = new Date(Date.UTC(2012, 5, 15));

    expect(pickAgeCategoryIdForBirthDate(cats, dob)).toBe("cat-open");

    const fee = {
      ageCategoryFeeTiers: [
        { ageCategoryId: "cat-open", individualEntryFee: 5000, teamEntryFeePerTeam: 8000 },
      ],
    };
    const feeR = resolveEntryFeeUnits(fee, null, {
      userDateOfBirth: dob,
      competitionAgeCategories: cats,
    });
    expect(feeR.ageTierMissing).toBe(false);
    expect(feeR.individualUnit).toBe(5000);

    const rawQual = {
      ageCategoryQualificationTiers: [
        { ageCategoryId: "cat-open", requiredQualifications: ["選手登録"] },
      ],
    };
    const catId = pickAgeCategoryIdForBirthDate(cats, dob);
    const rq = resolveRequiredQualificationsForAgeCategory(rawQual, catId);
    expect(rq.tierMissing).toBe(false);
    expect(rq.list).toEqual(["選手登録"]);
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

  it("parseAgeCategoryQualificationTiers と resolveRequiredQualificationsForAgeCategory で AGEカテゴリ別資格を解決する", () => {
    const raw = {
      ageCategoryQualificationTiers: [
        { ageCategoryId: "cat-u10", requiredQualifications: [] as string[] },
        { ageCategoryId: "cat-u15", requiredQualifications: ["選手登録"] },
        { ageCategoryId: "cat-open", requiredQualifications: ["選手登録", "BLS・WS"] },
      ],
    };
    expect(parseAgeCategoryQualificationTiers(raw)?.length).toBe(3);
    expect(resolveRequiredQualificationsForAgeCategory(raw, "cat-u10").list).toEqual([]);
    expect(resolveRequiredQualificationsForAgeCategory(raw, "cat-u15").list).toEqual(["選手登録"]);
    expect(resolveRequiredQualificationsForAgeCategory(raw, "cat-open").list).toEqual([
      "選手登録",
      "BLS・WS",
    ]);
  });

  it("AGEカテゴリ未指定／不存在カテゴリは tierMissing", () => {
    const raw = {
      ageCategoryQualificationTiers: [
        { ageCategoryId: "cat-a", requiredQualifications: ["選手登録"] },
      ],
    };
    expect(resolveRequiredQualificationsForAgeCategory(raw, null).tierMissing).toBe(true);
    expect(resolveRequiredQualificationsForAgeCategory(raw, "missing").tierMissing).toBe(true);
  });

  it("isQualificationTighteningByAgeCategory が新規要件を検知する", () => {
    const oldRaw = {
      ageCategoryQualificationTiers: [
        { ageCategoryId: "cat", requiredQualifications: [] },
      ],
    };
    const newRaw = {
      ageCategoryQualificationTiers: [
        { ageCategoryId: "cat", requiredQualifications: ["選手登録"] },
      ],
    };
    expect(isQualificationTighteningByAgeCategory(oldRaw, newRaw)).toBe(true);
    expect(isQualificationRelaxedByAgeCategory(newRaw, oldRaw)).toBe(true);
    expect(isQualificationTighteningByAgeCategory(newRaw, oldRaw)).toBe(false);
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

  it("認定LSマクロは 選手登録・BLS・WaterSafety・Referee系 を除外する", () => {
    const options = [
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "選手登録",
      "BLS",
      "WaterSafety",
      "RefereeC",
      "RefereeB",
      "RefereeA",
      "RefereeS",
      "BasicSurfLifesaver",
      "Instructor",
      "PWRCInstructor",
    ];
    const selected = applyEntryQualificationToggleWithCertifiedMacro(
      [],
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      options
    );
    expect(selected).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "BasicSurfLifesaver",
      "Instructor",
      "PWRCInstructor",
    ]);
    expect(selected).not.toContain("選手登録");
    expect(selected).not.toContain("BLS");
    expect(selected).not.toContain("WaterSafety");
    expect(selected).not.toContain("RefereeC");
    expect(selected).not.toContain("RefereeB");
    expect(selected).not.toContain("RefereeA");
    expect(selected).not.toContain("RefereeS");
  });

  it("認定LSマクロ展開で Instructor 系も対象になる", () => {
    const options = [
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "BLS",
      "WaterSafety",
      "Instructor",
      "BLSInstructor",
      "WaterSafetyInstructor",
    ];
    const expanded = normalizeEntryRequiredQualifications([ENTRY_REQUIRED_CERTIFIED_LIFESAVER], {
      allowedQualifications: new Set(options),
      expandCertifiedLifesaverMacro: true,
    });
    expect(expanded).toContain(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
    expect(expanded).toContain("Instructor");
    expect(expanded).toContain("BLSInstructor");
    expect(expanded).toContain("WaterSafetyInstructor");
    expect(expanded).not.toContain("BLS");
    expect(expanded).not.toContain("WaterSafety");
    expect(compactCertifiedLifesaverExpandedQualifications(expanded)).toEqual([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
    ]);
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

  it("maxIndividualEntryFeeUnitAcrossTiers returns max individual fee across age tiers", () => {
    const fee = {
      ageFeeTiers: [
        { minAge: 0, maxAge: 12, individualEntryFee: 1000, teamEntryFeePerTeam: 2000 },
        { minAge: 13, maxAge: null, individualEntryFee: 5000, teamEntryFeePerTeam: 8000 },
      ],
    };
    expect(maxIndividualEntryFeeUnitAcrossTiers(fee)).toBe(5000);
  });
});
