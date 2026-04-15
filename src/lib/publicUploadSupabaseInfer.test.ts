import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inferSupabasePublicUrlFromRelativePublicUploadPath,
  normalizeStoredPublicUploadUrl,
  publicUploadDisplaySrc,
} from "./publicUploadSupabaseInfer";

describe("normalizeStoredPublicUploadUrl", () => {
  it("prefixes uploads path when leading slash is missing (competitions)", () => {
    expect(normalizeStoredPublicUploadUrl("uploads/competitions/a.webp")).toBe(
      "/uploads/competitions/a.webp",
    );
  });

  it("prefixes uploads path when leading slash is missing (organizations)", () => {
    expect(normalizeStoredPublicUploadUrl("uploads/organizations/org-1.webp")).toBe(
      "/uploads/organizations/org-1.webp",
    );
  });
});

describe("inferSupabasePublicUrlFromRelativePublicUploadPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("infers organizations path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "public-assets");
    vi.stubEnv("RELATION_LOGOS_INFER_SUPABASE", "1");
    expect(
      inferSupabasePublicUrlFromRelativePublicUploadPath("/uploads/organizations/x.webp"),
    ).toBe(
      "https://abc.supabase.co/storage/v1/object/public/public-assets/organizations/x.webp",
    );
  });

  it("infers competitions path (協賛ロゴ等)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "public-assets");
    vi.stubEnv("RELATION_LOGOS_INFER_SUPABASE", "1");
    expect(
      inferSupabasePublicUrlFromRelativePublicUploadPath("/uploads/competitions/cmk-cooperator-1.webp"),
    ).toBe(
      "https://abc.supabase.co/storage/v1/object/public/public-assets/competitions/cmk-cooperator-1.webp",
    );
  });
});

describe("publicUploadDisplaySrc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty for nullish", () => {
    expect(publicUploadDisplaySrc(null)).toBe("");
    expect(publicUploadDisplaySrc(undefined)).toBe("");
  });

  it("passes through absolute https unchanged", () => {
    expect(publicUploadDisplaySrc("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
  });
});
