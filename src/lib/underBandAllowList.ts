import type { partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";
import { expectedUnderFeeTierKeys } from "@/lib/competitionUnderAgeSystem";

export type UnderPartition = ReturnType<typeof partitionUnderAgeBands>;

/**
 * DB の Json から帯キー配列を読む。null / 不正値は「制限なし（マスタの全帯）」。
 * 空配列は「許可帯なし」。
 */
export function parseStoredUnderBandKeys(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const keys = value
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  return keys;
}

/** 現在の partition に存在するキーだけ残す（しきい値変更後のゴミ除去） */
export function normalizeAllowListToPartition(
  allowList: string[] | null,
  partition: UnderPartition
): string[] | null {
  if (allowList === null) return null;
  const valid = new Set(expectedUnderFeeTierKeys(partition));
  return allowList.filter((k) => valid.has(k));
}

export function resolveEffectiveUnderBandAllowListForEvent(params: {
  underBandKeysOverride: unknown;
  ageCategoryId: string | null;
  categoryUnderBandKeysEnabled: unknown;
}): string[] | null {
  if (params.underBandKeysOverride != null) {
    return parseStoredUnderBandKeys(params.underBandKeysOverride);
  }
  if (!params.ageCategoryId) {
    return null;
  }
  return parseStoredUnderBandKeys(params.categoryUnderBandKeysEnabled);
}

export function validateUnderBandKeysForPartition(
  raw: unknown,
  partition: UnderPartition
): { ok: true; value: string[] | null } | { ok: false; message: string } {
  const valid = expectedUnderFeeTierKeys(partition);
  const validSet = new Set(valid);
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      message: "帯キーは null（全帯許可）または文字列の配列にしてください",
    };
  }
  for (const x of raw) {
    if (typeof x !== "string" || !validSet.has(x)) {
      return { ok: false, message: "帯キーに不正な値が含まれています" };
    }
  }
  return { ok: true, value: raw };
}
