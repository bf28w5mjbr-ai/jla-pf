import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeRelationLogos,
  normalizeStoredRelationLogoUrl,
  relationLogosWithDisplaySrc,
} from "./relationLogos";

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

describe("normalizeStoredRelationLogoUrl", () => {
  it("prefixes uploads path when leading slash is missing", () => {
    expect(normalizeStoredRelationLogoUrl("uploads/competitions/a.webp")).toBe(
      "/uploads/competitions/a.webp",
    );
  });
});

describe("relationLogosWithDisplaySrc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("infers Supabase public URL for relative competition logo path when env is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "public-assets");
    vi.stubEnv("RELATION_LOGOS_INFER_SUPABASE", "1");
    expect(
      relationLogosWithDisplaySrc([
        { name: "協賛", logoUrl: "/uploads/competitions/cmk-cooperator-1.webp" },
      ]),
    ).toEqual([
      {
        name: "協賛",
        logoUrl: "/uploads/competitions/cmk-cooperator-1.webp",
        displaySrc:
          "https://abc.supabase.co/storage/v1/object/public/public-assets/competitions/cmk-cooperator-1.webp",
      },
    ]);
  });

  it("passes through prehydrated rows without recomputing", () => {
    const pre = [
      {
        name: "X",
        logoUrl: "/uploads/competitions/x.webp",
        displaySrc: "https://keep.example/y.webp",
      },
    ];
    expect(relationLogosWithDisplaySrc(pre)).toBe(pre);
  });

  it("uses absolute logoUrl as displaySrc when infer is off", () => {
    vi.stubEnv("RELATION_LOGOS_INFER_SUPABASE", "0");
    expect(relationLogosWithDisplaySrc([{ name: "A", logoUrl: "https://cdn.example/a.png" }])).toEqual([
      { name: "A", logoUrl: "https://cdn.example/a.png", displaySrc: "https://cdn.example/a.png" },
    ]);
  });
});
