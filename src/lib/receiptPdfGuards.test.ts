import { describe, expect, it } from "vitest";
import { coercePdfIssuedDate, nonNegativeYenForPdf } from "@/lib/receiptPdfGuards";

describe("receiptPdfGuards", () => {
  it("nonNegativeYenForPdf は有限数を非負整数に丸める", () => {
    expect(nonNegativeYenForPdf(1234.6, 0)).toBe(1235);
    expect(nonNegativeYenForPdf(-10, 100)).toBe(0);
    expect(nonNegativeYenForPdf(Number.NaN, 42)).toBe(42);
    expect(nonNegativeYenForPdf("x", 7)).toBe(7);
  });

  it("coercePdfIssuedDate は有効な日付を優先する", () => {
    const ok = new Date("2024-03-15T00:00:00.000Z");
    expect(coercePdfIssuedDate(ok).getTime()).toBe(ok.getTime());
    const bad = new Date(Number.NaN);
    const fb = new Date("2020-01-01T00:00:00.000Z");
    expect(coercePdfIssuedDate(bad, fb).getTime()).toBe(fb.getTime());
  });
});
