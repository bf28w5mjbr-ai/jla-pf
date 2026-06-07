import { describe, expect, it } from "vitest";
import {
  entryRequiresClubSelection,
  paidEntryRequiresClubId,
} from "./entryClubPaymentRules";

describe("entryRequiresClubSelection", () => {
  it("所属クラブ不要のときは clubId なしでも不要", () => {
    expect(
      entryRequiresClubSelection({ requireClubMembership: false, clubId: null })
    ).toBe(false);
  });

  it("所属クラブ必須のとき clubId なしは不可", () => {
    expect(
      entryRequiresClubSelection({ requireClubMembership: true, clubId: null })
    ).toBe(true);
  });

  it("所属クラブ必須のとき clubId ありは可", () => {
    expect(
      entryRequiresClubSelection({ requireClubMembership: true, clubId: "club-1" })
    ).toBe(false);
  });
});

describe("paidEntryRequiresClubId", () => {
  it("所属クラブ不要・有料・clubId なしでもブロックしない", () => {
    expect(
      paidEntryRequiresClubId({
        requireClubMembership: false,
        totalFee: 3000,
        clubId: null,
      })
    ).toBe(false);
  });

  it("所属クラブ必須・有料・clubId なしはブロック", () => {
    expect(
      paidEntryRequiresClubId({
        requireClubMembership: true,
        totalFee: 3000,
        clubId: null,
      })
    ).toBe(true);
  });
});
