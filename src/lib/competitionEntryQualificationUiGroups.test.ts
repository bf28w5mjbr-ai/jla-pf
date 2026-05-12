import { describe, expect, it } from "vitest";
import { ENTRY_REQUIRED_CERTIFIED_LIFESAVER } from "@/lib/competitionEntryAgeTiered";
import { splitQualificationOptionsForAdminUi } from "@/lib/competitionEntryQualificationUiGroups";

describe("splitQualificationOptionsForAdminUi", () => {
  it("puts player registration then certified lifesaver before other options", () => {
    const { primary, other } = splitQualificationOptionsForAdminUi([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "選手登録",
      "BLS・WS",
    ]);
    expect(primary).toEqual(["選手登録", ENTRY_REQUIRED_CERTIFIED_LIFESAVER]);
    expect(other).toEqual(["BLS・WS"]);
  });

  it("puts only certified when no player registration in list", () => {
    const { primary, other } = splitQualificationOptionsForAdminUi([
      ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
      "IRBクルー",
    ]);
    expect(primary).toEqual([ENTRY_REQUIRED_CERTIFIED_LIFESAVER]);
    expect(other).toEqual(["IRBクルー"]);
  });
});
