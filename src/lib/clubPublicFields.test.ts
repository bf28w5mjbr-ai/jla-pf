import { describe, expect, it } from "vitest";
import { clubPublicSelect } from "./clubPublicFields";

describe("clubPublicSelect", () => {
  it("代表者・連絡先・住所詳細フィールドを含まない", () => {
    const keys = Object.keys(clubPublicSelect);
    const forbidden = [
      "representativeFamilyName",
      "representativeGivenName",
      "representativePhone",
      "officePostalCode",
      "officeAddressLine1",
      "officeAddressLine2",
      "officePhone",
      "mailingName",
    ];
    for (const field of forbidden) {
      expect(keys).not.toContain(field);
    }
  });

  it("公開用の基本フィールドを含む", () => {
    expect(clubPublicSelect).toMatchObject({
      id: true,
      name: true,
      logoUrl: true,
      officePrefecture: true,
      officeCity: true,
    });
  });
});
