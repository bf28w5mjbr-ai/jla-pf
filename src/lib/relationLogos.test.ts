import { describe, expect, it } from "vitest";
import { normalizeRelationLogos } from "./relationLogos";

describe("normalizeRelationLogos", () => {
  it("accepts canonical shape", () => {
    expect(
      normalizeRelationLogos([{ name: "A社", logoUrl: "https://x.example/a.png" }]),
    ).toEqual([{ name: "A社", logoUrl: "https://x.example/a.png" }]);
  });

  it("maps snake_case logo_url", () => {
    expect(
      normalizeRelationLogos([{ name: "B", logo_url: "https://x.example/b.png" }]),
    ).toEqual([{ name: "B", logoUrl: "https://x.example/b.png" }]);
  });

  it("prefixes protocol-relative URLs with https", () => {
    expect(normalizeRelationLogos([{ name: "C", logoUrl: "//cdn.example/c.png" }])).toEqual([
      { name: "C", logoUrl: "https://cdn.example/c.png" },
    ]);
  });

  it("trims logo URL and skips empty rows", () => {
    expect(
      normalizeRelationLogos([
        { name: "D", logoUrl: "  https://x/d.png  " },
        { name: "skip", logoUrl: "   " },
      ]),
    ).toEqual([{ name: "D", logoUrl: "https://x/d.png" }]);
  });

  it("parses JSON string payload (double-encoded or legacy)", () => {
    const raw = JSON.stringify([{ name: "E", logoUrl: "https://x.example/e.png" }]);
    expect(normalizeRelationLogos(raw)).toEqual([
      { name: "E", logoUrl: "https://x.example/e.png" },
    ]);
  });

  it("accepts logoURL camel variant", () => {
    expect(normalizeRelationLogos([{ name: "F", logoURL: "https://x.example/f.png" }])).toEqual([
      { name: "F", logoUrl: "https://x.example/f.png" },
    ]);
  });
});
