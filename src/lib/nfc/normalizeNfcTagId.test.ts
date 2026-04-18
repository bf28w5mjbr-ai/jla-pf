import { describe, expect, it } from "vitest";
import { normalizeNfcTagId } from "@/lib/nfc/normalizeNfcTagId";

describe("normalizeNfcTagId", () => {
  it("unifies colon-separated hex (Web NFC style)", () => {
    expect(normalizeNfcTagId("e4:04:65:12:34:56:78")).toBe("E4046512345678");
  });

  it("strips spaces and hyphens", () => {
    expect(normalizeNfcTagId(" E4-04-65 ")).toBe("E40465");
  });

  it("matches server contract for continuous hex", () => {
    expect(normalizeNfcTagId("E4046512345678")).toBe("E4046512345678");
  });
});
