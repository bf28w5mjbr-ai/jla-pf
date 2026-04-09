import { describe, expect, it } from "vitest";
import { appendRedirectQuery, safePostLoginPath } from "./postLoginRedirect";

describe("safePostLoginPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safePostLoginPath("/invite/technical-official/abc")).toBe("/invite/technical-official/abc");
  });
  it("rejects open redirects", () => {
    expect(safePostLoginPath("//evil.com")).toBeNull();
    expect(safePostLoginPath("https://evil.com")).toBeNull();
    expect(safePostLoginPath("javascript:alert(1)")).toBeNull();
  });
});

describe("appendRedirectQuery", () => {
  it("appends redirect param", () => {
    expect(appendRedirectQuery("/login", "/dashboard")).toBe("/login?redirect=%2Fdashboard");
  });
  it("uses & when base has query", () => {
    expect(appendRedirectQuery("/login/sms/otp?sessionId=x", "/y")).toContain("&redirect=");
  });
});
