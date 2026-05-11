import { describe, expect, it } from "vitest";
import {
  buildNameContainsWhere,
  looksLikeEmailQuery,
  looksLikeUserIdQuery,
  maskBankAccountNumber,
  sliceNameSearchCandidates,
} from "./adminSecurityLookup";

describe("looksLikeEmailQuery", () => {
  it("returns true when @ is present", () => {
    expect(looksLikeEmailQuery("a@b.co")).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(looksLikeEmailQuery("yamada")).toBe(false);
  });
});

describe("looksLikeUserIdQuery", () => {
  it("accepts cuid-shaped ids", () => {
    const id = "c" + "a".repeat(24);
    expect(id.length).toBe(25);
    expect(looksLikeUserIdQuery(id)).toBe(true);
  });
  it("rejects short strings", () => {
    expect(looksLikeUserIdQuery("short")).toBe(false);
  });
  it("rejects email-shaped strings", () => {
    expect(looksLikeUserIdQuery("c" + "a".repeat(10) + "@x.com")).toBe(false);
  });
  it("rejects names with non-alphanumeric", () => {
    expect(looksLikeUserIdQuery("山田太郎山田太郎山田太郎山田")).toBe(false);
  });
});

describe("buildNameContainsWhere", () => {
  it("builds OR across name fields", () => {
    const w = buildNameContainsWhere("ヤマダ");
    expect(w.OR).toHaveLength(4);
  });
});

describe("sliceNameSearchCandidates", () => {
  it("truncates when more than 20 rows", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ i }));
    const { candidates, truncated } = sliceNameSearchCandidates(rows);
    expect(truncated).toBe(true);
    expect(candidates).toHaveLength(20);
  });
  it("does not truncate for 20 or fewer", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ i }));
    const { candidates, truncated } = sliceNameSearchCandidates(rows);
    expect(truncated).toBe(false);
    expect(candidates).toHaveLength(20);
  });
});

describe("maskBankAccountNumber", () => {
  it("masks long numbers", () => {
    expect(maskBankAccountNumber("1234567890")).toBe("****7890");
  });
  it("masks short numbers entirely", () => {
    expect(maskBankAccountNumber("12")).toBe("****");
  });
});
