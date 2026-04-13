import { describe, expect, it } from "vitest";
import { partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";
import {
  normalizeAllowListToPartition,
  parseStoredUnderBandKeys,
  resolveEffectiveUnderBandAllowListForEvent,
  validateUnderBandKeysForPartition,
} from "@/lib/underBandAllowList";

describe("underBandAllowList", () => {
  it("parseStoredUnderBandKeys: null and all-invalid yield null (全帯)", () => {
    expect(parseStoredUnderBandKeys(null)).toBeNull();
    expect(parseStoredUnderBandKeys(undefined)).toBeNull();
    expect(parseStoredUnderBandKeys("x")).toBeNull();
  });

  it("validateUnderBandKeysForPartition rejects unknown keys", () => {
    const p = partitionUnderAgeBands([10, 15], true);
    expect(validateUnderBandKeysForPartition(["U-99"], p).ok).toBe(false);
    expect(validateUnderBandKeysForPartition(["U-10", "OPEN"], p).ok).toBe(true);
  });

  it("normalizeAllowListToPartition strips stale keys", () => {
    const p = partitionUnderAgeBands([10], true);
    expect(normalizeAllowListToPartition(["U-10", "U-99"], p)).toEqual(["U-10"]);
  });

  it("resolveEffectiveUnderBandAllowListForEvent inherits category when override null", () => {
    expect(
      resolveEffectiveUnderBandAllowListForEvent({
        underBandKeysOverride: null,
        ageCategoryId: "c1",
        categoryUnderBandKeysEnabled: ["U-10"],
      })
    ).toEqual(["U-10"]);
    expect(
      resolveEffectiveUnderBandAllowListForEvent({
        underBandKeysOverride: null,
        ageCategoryId: null,
        categoryUnderBandKeysEnabled: null,
      })
    ).toBeNull();
  });
});
