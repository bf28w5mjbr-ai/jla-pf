import { describe, expect, it } from "vitest";
import {
  normalizeOptionalHttpUrl,
  parseOptionalWebsiteUrlField,
} from "./safeExternalUrl";

describe("normalizeOptionalHttpUrl", () => {
  it("returns null for empty input", () => {
    expect(normalizeOptionalHttpUrl(null)).toBeNull();
    expect(normalizeOptionalHttpUrl(undefined)).toBeNull();
    expect(normalizeOptionalHttpUrl("")).toBeNull();
    expect(normalizeOptionalHttpUrl("   ")).toBeNull();
  });

  it("accepts http and https URLs", () => {
    expect(normalizeOptionalHttpUrl("https://example.com/path")).toBe(
      "https://example.com/path"
    );
    expect(normalizeOptionalHttpUrl("http://example.com/")).toBe(
      "http://example.com/"
    );
  });

  it("prepends https when scheme is omitted", () => {
    expect(normalizeOptionalHttpUrl("example.com/foo")).toBe(
      "https://example.com/foo"
    );
  });

  it("rejects dangerous schemes", () => {
    expect(normalizeOptionalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeOptionalHttpUrl("data:text/html,<script>")).toBeNull();
    expect(normalizeOptionalHttpUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects URLs with embedded credentials", () => {
    expect(normalizeOptionalHttpUrl("https://user:pass@example.com/")).toBeNull();
  });
});

describe("parseOptionalWebsiteUrlField", () => {
  it("accepts null and valid strings", () => {
    expect(parseOptionalWebsiteUrlField(null)).toEqual({
      ok: true,
      value: null,
    });
    expect(parseOptionalWebsiteUrlField("  ")).toEqual({
      ok: true,
      value: null,
    });
    expect(parseOptionalWebsiteUrlField("https://a.jp")).toEqual({
      ok: true,
      value: "https://a.jp/",
    });
  });

  it("rejects non-strings", () => {
    const r = parseOptionalWebsiteUrlField(123);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });

  it("rejects javascript URLs", () => {
    const r = parseOptionalWebsiteUrlField("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });
});
