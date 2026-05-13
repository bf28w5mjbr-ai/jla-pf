import { describe, expect, it } from "vitest";
import { ENTRY_REQUIRED_CERTIFIED_LIFESAVER } from "@/lib/competitionEntryAgeTiered";
import { splitQualificationOptionsForAdminUi } from "@/lib/competitionEntryQualificationUiGroups";

describe("splitQualificationOptionsForAdminUi", () => {
  it("puts player registration then certified lifesaver before other options", () => {
    const { primary, foundation, other } = splitQualificationOptionsForAdminUi([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "選手登録",
      "BasicSurfLifesaver",
    ]);
    expect(primary).toEqual(["選手登録", ENTRY_REQUIRED_CERTIFIED_LIFESAVER]);
    expect(foundation).toEqual([]);
    expect(other).toEqual(["BasicSurfLifesaver"]);
  });

  it("puts only certified when no player registration in list", () => {
    const { primary, foundation, other } = splitQualificationOptionsForAdminUi([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "IRBクルー",
    ]);
    expect(primary).toEqual([ENTRY_REQUIRED_CERTIFIED_LIFESAVER]);
    expect(foundation).toEqual([]);
    expect(other).toEqual(["IRBクルー"]);
  });

  it("places BLS / WaterSafety / Referee系 into the foundation group", () => {
    const { primary, foundation, other } = splitQualificationOptionsForAdminUi([
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
    ]);
    expect(primary).toEqual(["選手登録", ENTRY_REQUIRED_CERTIFIED_LIFESAVER]);
    expect(foundation).toEqual([
      "BLS",
      "WaterSafety",
      "RefereeC",
      "RefereeB",
      "RefereeA",
      "RefereeS",
    ]);
    expect(other).toEqual(["BasicSurfLifesaver", "Instructor"]);
  });

  it("recognizes Japanese labels for foundation group", () => {
    const { foundation, other } = splitQualificationOptionsForAdminUi([
      "ウォーターセーフティ",
      "審判C",
      "審判B",
      "審判A",
      "審判S",
      "プールライフガード",
    ]);
    expect(foundation).toEqual([
      "ウォーターセーフティ",
      "審判C",
      "審判B",
      "審判A",
      "審判S",
    ]);
    expect(other).toEqual(["プールライフガード"]);
  });
});
