import { describe, expect, it } from "vitest";
import {
  COVER_PAGE_CANONICAL_URL,
  isCoverPageHost,
  shouldRedirectNonCoverHomeToCanonical,
} from "@/lib/coverPageHost";

describe("coverPageHost", () => {
  it("isCoverPageHost recognizes bluvium.jp", () => {
    expect(isCoverPageHost("bluvium.jp")).toBe(true);
    expect(isCoverPageHost("www.bluvium.jp")).toBe(true);
    expect(isCoverPageHost("other.example")).toBe(false);
  });

  it("shouldRedirectNonCoverHomeToCanonical only for non-cover /", () => {
    expect(shouldRedirectNonCoverHomeToCanonical("/", "app.example.com")).toBe(true);
    expect(shouldRedirectNonCoverHomeToCanonical("/", "bluvium.jp")).toBe(false);
    expect(shouldRedirectNonCoverHomeToCanonical("/login", "app.example.com")).toBe(false);
    expect(shouldRedirectNonCoverHomeToCanonical("/", null)).toBe(false);
  });

  it("COVER_PAGE_CANONICAL_URL points to bluvium.jp", () => {
    expect(COVER_PAGE_CANONICAL_URL).toBe("https://bluvium.jp/");
  });
});
