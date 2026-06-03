import { afterEach, describe, expect, it, vi } from "vitest";
import {
  groupRelatedOrganizationsByRole,
  migrateLegacyRelatedOrganizations,
  normalizeRelatedOrganizations,
  relatedOrganizationsWithDisplaySrc,
  validateRelatedOrganizationsPayload,
} from "./competitionRelatedOrganizations";

describe("normalizeRelatedOrganizations", () => {
  it("accepts canonical shape", () => {
    expect(
      normalizeRelatedOrganizations([
        { id: "a1", name: "A社", role: "sponsor", sortOrder: 0 },
      ]),
    ).toEqual([{ id: "a1", name: "A社", role: "sponsor", logoUrl: null, sortOrder: 0 }]);
  });

  it("sorts by sortOrder", () => {
    expect(
      normalizeRelatedOrganizations([
        { id: "b", name: "B", role: "grant", sortOrder: 2 },
        { id: "a", name: "A", role: "sponsor", sortOrder: 0 },
      ]).map((o) => o.id),
    ).toEqual(["a", "b"]);
  });

  it("skips invalid rows", () => {
    expect(
      normalizeRelatedOrganizations([
        { id: "ok", name: "OK", role: "cooperator", sortOrder: 0 },
        { id: "", name: "X", role: "sponsor" },
        { id: "y", name: "Y", role: "invalid" },
      ]),
    ).toEqual([{ id: "ok", name: "OK", role: "cooperator", logoUrl: null, sortOrder: 0 }]);
  });
});

describe("migrateLegacyRelatedOrganizations", () => {
  it("merges text lines and logos by name within role", () => {
    const result = migrateLegacyRelatedOrganizations({
      sponsors: "後援A\n後援B",
      cooperators: "協賛A",
      cooperatorsLogos: [{ name: "協賛A", logoUrl: "https://x.example/a.png" }],
      supporters: null,
      grants: "助成A",
      grantsLogos: [{ name: "助成ロゴのみ", logoUrl: "/uploads/competitions/g.webp" }],
    });

    expect(result).toHaveLength(5);
    const cooperatorA = result.find((o) => o.name === "協賛A");
    expect(cooperatorA?.role).toBe("cooperator");
    expect(cooperatorA?.logoUrl).toBe("https://x.example/a.png");

    const grantLogoOnly = result.find((o) => o.name === "助成ロゴのみ");
    expect(grantLogoOnly?.role).toBe("grant");
    expect(grantLogoOnly?.logoUrl).toBe("/uploads/competitions/g.webp");
  });

  it("skips when relatedOrganizations already populated", () => {
    const existing = [{ id: "x", name: "既存", role: "sponsor", sortOrder: 0 }];
    expect(
      migrateLegacyRelatedOrganizations({
        relatedOrganizations: existing,
        sponsors: "無視される",
      }),
    ).toEqual([{ id: "x", name: "既存", role: "sponsor", logoUrl: null, sortOrder: 0 }]);
  });
});

describe("groupRelatedOrganizationsByRole", () => {
  it("groups by role preserving order within group", () => {
    const grouped = groupRelatedOrganizationsByRole([
      { id: "1", name: "A", role: "sponsor", logoUrl: null, sortOrder: 0, displaySrc: null },
      { id: "2", name: "B", role: "cooperator", logoUrl: null, sortOrder: 1, displaySrc: null },
      { id: "3", name: "C", role: "sponsor", logoUrl: null, sortOrder: 2, displaySrc: null },
    ]);
    expect(grouped.sponsor.map((o) => o.name)).toEqual(["A", "C"]);
    expect(grouped.cooperator.map((o) => o.name)).toEqual(["B"]);
    expect(grouped.supporter).toEqual([]);
  });
});

describe("validateRelatedOrganizationsPayload", () => {
  it("accepts valid payload", () => {
    const result = validateRelatedOrganizationsPayload([
      { id: "a", name: "A社", role: "sponsor", sortOrder: 0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.organizations[0]?.name).toBe("A社");
    }
  });

  it("rejects duplicate ids", () => {
    const result = validateRelatedOrganizationsPayload([
      { id: "dup", name: "A", role: "sponsor" },
      { id: "dup", name: "B", role: "grant" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects empty name", () => {
    const result = validateRelatedOrganizationsPayload([{ id: "a", name: "  ", role: "sponsor" }]);
    expect(result.ok).toBe(false);
  });
});

describe("relatedOrganizationsWithDisplaySrc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("infers displaySrc for relative logo paths", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "public-assets");
    vi.stubEnv("RELATION_LOGOS_INFER_SUPABASE", "1");
    expect(
      relatedOrganizationsWithDisplaySrc([
        {
          id: "1",
          name: "協賛",
          role: "cooperator",
          logoUrl: "/uploads/competitions/cmk-cooperator-1.webp",
          sortOrder: 0,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        displaySrc:
          "https://abc.supabase.co/storage/v1/object/public/public-assets/competitions/cmk-cooperator-1.webp",
      }),
    ]);
  });
});
