import { describe, expect, it } from "vitest";
import { sanitizeSupabaseObjectKey } from "./storageKey";

/** supabase/storage limits.ts と同じ */
function isValidKey(key: string): boolean {
  return key.length > 0 && /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(key);
}

describe("sanitizeSupabaseObjectKey", () => {
  it("leaves already-safe keys unchanged", () => {
    const k = "competitions/cmk123-1775925798401-file.pdf";
    expect(sanitizeSupabaseObjectKey(k)).toBe(k);
    expect(isValidKey(k)).toBe(true);
  });

  it("strips characters rejected by Supabase isValidKey", () => {
    const k = sanitizeSupabaseObjectKey("competitions/x-競技者_募集.pdf");
    expect(isValidKey(k)).toBe(true);
    expect(k).not.toContain("競");
  });

  it("maps pipe and hash to underscore", () => {
    const k = sanitizeSupabaseObjectKey("a|b#c");
    expect(isValidKey(k)).toBe(true);
    expect(k).toMatch(/^[a-z_]+$/);
  });

  it("returns object when input is empty after strip", () => {
    expect(sanitizeSupabaseObjectKey("")).toBe("object");
    expect(isValidKey("object")).toBe(true);
  });
});
