/**
 * 種目への参加可否判定（年齢カテゴリ明示リスト or 生年月日レンジ）。
 *
 * - `allowedAgeCategoryIds` が 1 件以上 → そのカテゴリに属する選手のみ可
 * - null/空 + `ageCategoryId` あり → `[ageCategoryId]` 相当
 * - いずれもなし → 種目の生年月日 or min/max 年齢（レガシー）
 */

import {
  type EventBirthDateFields,
  meetsEventAgeOrBirthRule,
} from "@/lib/eventBirthDateEligibility";
import {
  type CompetitionAgeCategoryForEntryFee,
  pickAgeCategoryIdForBirthDate,
} from "@/lib/competitionEntryAgeTiered";

export type EventAgeEligibilityFields = EventBirthDateFields & {
  ageCategoryId?: string | null;
  allowedAgeCategoryIds?: unknown;
};

export function parseAllowedAgeCategoryIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return ids.length > 0 ? ids : null;
}

/** 大会のカテゴリ ID 集合に対して許可リストを検証。問題なければ重複除去済み配列 */
export function validateAllowedAgeCategoryIdsAgainstCompetition(
  ids: string[],
  validCategoryIds: ReadonlySet<string>
): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (ids.length === 0) {
    return { ok: false, message: "参加可能な年齢カテゴリを1件以上選んでください" };
  }
  const unique = Array.from(new Set(ids));
  for (const id of unique) {
    if (!validCategoryIds.has(id)) {
      return { ok: false, message: `不明な年齢カテゴリ ID「${id}」です` };
    }
  }
  return { ok: true, ids: unique };
}

/** 種目で参加可能な AGEカテゴリ ID。null のときは生年月日ルールへフォールバック */
export function resolveAllowedAgeCategoryIds(event: {
  ageCategoryId?: string | null;
  allowedAgeCategoryIds?: unknown;
}): string[] | null {
  const explicit = parseAllowedAgeCategoryIds(event.allowedAgeCategoryIds);
  if (explicit) return explicit;
  if (event.ageCategoryId) return [event.ageCategoryId];
  return null;
}

export function meetsCompetitionEventAgeEligibility(params: {
  event: EventAgeEligibilityFields;
  userDateOfBirth: Date | null;
  /** 大会開始日の属する年度末（翌4/1）時点の満年齢。カテゴリ判定時は未使用 */
  seasonalAgeYears: number | null;
  competitionAgeCategories?: ReadonlyArray<CompetitionAgeCategoryForEntryFee> | null;
}): boolean {
  const allowed = resolveAllowedAgeCategoryIds(params.event);
  if (allowed) {
    const cats = params.competitionAgeCategories ?? [];
    if (!params.userDateOfBirth) return false;
    const userCat = pickAgeCategoryIdForBirthDate(cats, params.userDateOfBirth);
    if (!userCat) return false;
    return allowed.includes(userCat);
  }

  return meetsEventAgeOrBirthRule({
    userDateOfBirth: params.userDateOfBirth,
    userEligibilityAgeYears: params.seasonalAgeYears,
    event: params.event,
  });
}
