import { describe, it, expect } from "vitest";
import {
  parsePhoneToE164,
  splitE164ForInput,
  isValidMobileE164,
  isValidPhoneE164,
  isValidJapaneseMobile,
  toE164,
  phoneToE164Loose,
  maskPhoneNumber,
  normalizeToE164,
} from "./phone";

describe("phone", () => {
  it("parses Japanese mobile to E.164", () => {
    expect(parsePhoneToE164("JP", "09012345678")).toBe("+819012345678");
    expect(toE164("09012345678")).toBe("+819012345678");
    expect(toE164("+819012345678")).toBe("+819012345678");
  });

  it("parses US mobile to E.164", () => {
    const e164 = parsePhoneToE164("US", "4155552671");
    expect(e164).toBe("+14155552671");
    expect(isValidMobileE164(e164!)).toBe(true);
  });

  it("rejects invalid numbers", () => {
    expect(parsePhoneToE164("JP", "123")).toBeNull();
    expect(isValidMobileE164("+81901234567")).toBe(false);
  });

  it("isValidJapaneseMobile accepts JP mobile only", () => {
    expect(isValidJapaneseMobile("09012345678")).toBe(true);
    expect(isValidJapaneseMobile("+14155552671")).toBe(false);
  });

  it("splitE164ForInput round-trips JP", () => {
    const split = splitE164ForInput("+819012345678");
    expect(split.country).toBe("JP");
    expect(parsePhoneToE164(split.country, split.national)).toBe("+819012345678");
  });

  it("phoneToE164Loose handles E.164 and domestic", () => {
    expect(phoneToE164Loose("+14155552671")).toBe("+14155552671");
    expect(phoneToE164Loose("09012345678")).toBe("+819012345678");
  });

  it("isValidPhoneE164 allows landline", () => {
    const jpLandline = normalizeToE164("0312345678", "JP");
    if (jpLandline) {
      expect(isValidPhoneE164(jpLandline)).toBe(true);
      expect(isValidMobileE164(jpLandline)).toBe(false);
    }
  });

  it("maskPhoneNumber masks suffix", () => {
    expect(maskPhoneNumber("+819012345678")).toContain("5678");
    expect(maskPhoneNumber("+819012345678")).toContain("****");
    expect(maskPhoneNumber("+14155552671")).toContain("****");
  });
});
