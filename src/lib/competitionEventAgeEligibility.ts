/**
 * 種目への参加可否判定（年齢／生年月日）— 年齢カテゴリに一本化後のロジック。
 *
 * 以前は「アンダー制 ON 時はマスタの帯（U-○/OPEN）と種目の許可帯」で判定していたが、
 * これらはすべて AGEカテゴリ（生年月日レンジ）に統一された。
 * 種目は `ageCategoryId` で 0〜1 個の AGEカテゴリに紐づき、紐づいたカテゴリの
 * `eligibleBirthDateFrom/To` がそのまま参加可能な生年月日となる。
 */

import {
  type EventBirthDateFields,
  meetsEventAgeOrBirthRule,
} from "@/lib/eventBirthDateEligibility";

export function meetsCompetitionEventAgeEligibility(params: {
  event: EventBirthDateFields;
  userDateOfBirth: Date | null;
  /** 大会開始日の属する年度末（翌4/1）時点の満年齢。生年月日のみで判定する場合は無視される */
  seasonalAgeYears: number | null;
}): boolean {
  return meetsEventAgeOrBirthRule({
    userDateOfBirth: params.userDateOfBirth,
    userEligibilityAgeYears: params.seasonalAgeYears,
    event: params.event,
  });
}
