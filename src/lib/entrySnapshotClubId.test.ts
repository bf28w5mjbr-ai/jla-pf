import { describe, expect, it } from "vitest";
import { extractClubIdFromEntrySnapshotData } from "@/lib/entrySnapshotClubId";

describe("extractClubIdFromEntrySnapshotData", () => {
  it("returns null for non-objects", () => {
    expect(extractClubIdFromEntrySnapshotData(null)).toBeNull();
    expect(extractClubIdFromEntrySnapshotData(undefined)).toBeNull();
    expect(extractClubIdFromEntrySnapshotData("x")).toBeNull();
    expect(extractClubIdFromEntrySnapshotData([])).toBeNull();
  });

  it("reads trimmed string clubId", () => {
    expect(
      extractClubIdFromEntrySnapshotData({ clubId: "  clubabc  ", items: [] })
    ).toBe("clubabc");
  });

  it("returns null for empty or missing clubId", () => {
    expect(extractClubIdFromEntrySnapshotData({ items: [] })).toBeNull();
    expect(extractClubIdFromEntrySnapshotData({ clubId: "" })).toBeNull();
    expect(extractClubIdFromEntrySnapshotData({ clubId: "   " })).toBeNull();
    expect(extractClubIdFromEntrySnapshotData({ clubId: null })).toBeNull();
  });

  it("returns null for non-string clubId", () => {
    expect(extractClubIdFromEntrySnapshotData({ clubId: 1 })).toBeNull();
  });
});
