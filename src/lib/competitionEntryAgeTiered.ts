/** 大会エントリーの参加費・必須資格を年齢帯別に扱う（JSON 保存形式の解釈と検証） */

import {
  eventUsesBirthDateRange,
  isUserDobInEventBirthDateRange,
} from "@/lib/eventBirthDateEligibility";

export const ALLOWED_ENTRY_REQUIRED_QUALIFICATIONS = [
  "選手登録",
  "BLS・WS",
  "認定ライフセーバー",
] as const;

export type AgeFeeTier = {
  minAge: number;
  /** 上限なしのとき null（両端とも大会の満年齢に含む） */
  maxAge: number | null;
  individualEntryFee: number;
  teamEntryFeePerTeam: number;
};

/** 大会の CompetitionAgeCategory.id ごとの参加費（JSON: ageCategoryFeeTiers） */
export type AgeCategoryFeeTier = {
  ageCategoryId: string;
  individualEntryFee: number;
  teamEntryFeePerTeam: number;
};

export type CompetitionAgeCategoryForEntryFee = {
  id: string;
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
  displayOrder: number;
};

export type ResolveEntryFeeContext = {
  userDateOfBirth?: Date | null;
  competitionAgeCategories?: ReadonlyArray<CompetitionAgeCategoryForEntryFee> | null;
};

export type AgeQualificationTier = {
  minAge: number;
  maxAge: number | null;
  /** DB の JSON キーと一致 */
  requiredQualifications: string[];
};

function sortAgeTiers<T extends { minAge: number; maxAge: number | null }>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.minAge - b.minAge);
}

export function pickTierForAge<T extends { minAge: number; maxAge: number | null }>(
  tiers: T[],
  age: number
): T | null {
  const sorted = sortAgeTiers(tiers);
  for (const t of sorted) {
    if (age < t.minAge) continue;
    if (t.maxAge !== null && age > t.maxAge) continue;
    return t;
  }
  return null;
}

export function parseAgeFeeTiers(entryFee: unknown): AgeFeeTier[] | null {
  if (!entryFee || typeof entryFee !== "object" || Array.isArray(entryFee)) return null;
  const o = entryFee as Record<string, unknown>;
  const raw = o.ageFeeTiers;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: AgeFeeTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const minAge = typeof t.minAge === "number" ? Math.floor(t.minAge) : NaN;
    const maxAge =
      t.maxAge === null || t.maxAge === undefined
        ? null
        : typeof t.maxAge === "number"
          ? Math.floor(t.maxAge)
          : NaN;
    const individualEntryFee =
      typeof t.individualEntryFee === "number" ? t.individualEntryFee : NaN;
    const teamEntryFeePerTeam =
      typeof t.teamEntryFeePerTeam === "number" ? t.teamEntryFeePerTeam : NaN;
    if (!Number.isFinite(minAge) || minAge < 0) continue;
    if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) continue;
    if (!Number.isFinite(individualEntryFee) || individualEntryFee < 0) continue;
    if (!Number.isFinite(teamEntryFeePerTeam) || teamEntryFeePerTeam < 0) continue;
    out.push({ minAge, maxAge, individualEntryFee, teamEntryFeePerTeam });
  }
  return out.length > 0 ? sortAgeTiers(out) : null;
}

export function parseAgeCategoryFeeTiers(entryFee: unknown): AgeCategoryFeeTier[] | null {
  if (!entryFee || typeof entryFee !== "object" || Array.isArray(entryFee)) return null;
  const o = entryFee as Record<string, unknown>;
  const raw = o.ageCategoryFeeTiers;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return normalizeAgeCategoryFeeTiersInput(raw);
}

/** PUT リクエスト body の配列から正規化（DB 照合は呼び出し側） */
export function normalizeAgeCategoryFeeTiersInput(items: unknown[]): AgeCategoryFeeTier[] | null {
  const out: AgeCategoryFeeTier[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const ageCategoryId = typeof t.ageCategoryId === "string" ? t.ageCategoryId.trim() : "";
    const individualEntryFee =
      typeof t.individualEntryFee === "number" ? t.individualEntryFee : NaN;
    const teamEntryFeePerTeam =
      typeof t.teamEntryFeePerTeam === "number" ? t.teamEntryFeePerTeam : NaN;
    if (!ageCategoryId) continue;
    if (!Number.isFinite(individualEntryFee) || individualEntryFee < 0) continue;
    if (!Number.isFinite(teamEntryFeePerTeam) || teamEntryFeePerTeam < 0) continue;
    out.push({ ageCategoryId, individualEntryFee, teamEntryFeePerTeam });
  }
  return out.length > 0 ? out : null;
}

/**
 * 生年月日が属する最初の年齢カテゴリ（displayOrder 昇順）。範囲未設定のカテゴリは照合に使わない。
 */
export function pickAgeCategoryIdForBirthDate(
  categories: ReadonlyArray<CompetitionAgeCategoryForEntryFee>,
  userDateOfBirth: Date
): string | null {
  const usable = categories
    .filter((c) => eventUsesBirthDateRange(c))
    .filter((c) =>
      isUserDobInEventBirthDateRange(userDateOfBirth, c.eligibleBirthDateFrom, c.eligibleBirthDateTo)
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return usable[0]?.id ?? null;
}

export function isTieredEntryFee(entryFee: unknown): boolean {
  return parseAgeFeeTiers(entryFee) !== null || parseAgeCategoryFeeTiers(entryFee) !== null;
}

export function flattenFlatEntryFeeUnits(entryFee: unknown): {
  individual: number;
  team: number;
} {
  if (entryFee == null) return { individual: 0, team: 0 };
  if (typeof entryFee === "number") {
    const n = Number.isFinite(entryFee) && entryFee >= 0 ? entryFee : 0;
    return { individual: n, team: 0 };
  }
  if (typeof entryFee !== "object" || Array.isArray(entryFee)) {
    return { individual: 0, team: 0 };
  }
  if (parseAgeFeeTiers(entryFee) || parseAgeCategoryFeeTiers(entryFee)) {
    return { individual: 0, team: 0 };
  }
  const o = entryFee as Record<string, unknown>;
  const individual =
    typeof o.individualEntryFee === "number"
      ? o.individualEntryFee
      : typeof o.baseFee === "number"
        ? o.baseFee
        : 0;
  const team = typeof o.teamEntryFeePerTeam === "number" ? o.teamEntryFeePerTeam : 0;
  return { individual, team };
}

export function resolveEntryFeeUnits(
  entryFee: unknown,
  userAgeYearsAtCompetitionStart: number | null,
  context?: ResolveEntryFeeContext
): {
  individualUnit: number;
  teamUnit: number;
  tiered: boolean;
  /** 年齢帯別／カテゴリ別で解決できない（生年月日なし・該当なしなど） */
  ageTierMissing: boolean;
} {
  const catTiers = parseAgeCategoryFeeTiers(entryFee);
  if (catTiers) {
    const dob = context?.userDateOfBirth ?? null;
    const cats = context?.competitionAgeCategories ?? null;
    if (!dob || !cats?.length) {
      return { individualUnit: 0, teamUnit: 0, tiered: true, ageTierMissing: true };
    }
    const categoryId = pickAgeCategoryIdForBirthDate(cats, dob);
    if (!categoryId) {
      return { individualUnit: 0, teamUnit: 0, tiered: true, ageTierMissing: true };
    }
    const row = catTiers.find((t) => t.ageCategoryId === categoryId);
    if (!row) {
      return { individualUnit: 0, teamUnit: 0, tiered: true, ageTierMissing: true };
    }
    return {
      individualUnit: row.individualEntryFee,
      teamUnit: row.teamEntryFeePerTeam,
      tiered: true,
      ageTierMissing: false,
    };
  }

  const tiers = parseAgeFeeTiers(entryFee);
  if (tiers) {
    if (userAgeYearsAtCompetitionStart === null) {
      return { individualUnit: 0, teamUnit: 0, tiered: true, ageTierMissing: true };
    }
    const t = pickTierForAge(tiers, userAgeYearsAtCompetitionStart);
    if (!t) {
      return { individualUnit: 0, teamUnit: 0, tiered: true, ageTierMissing: true };
    }
    return {
      individualUnit: t.individualEntryFee,
      teamUnit: t.teamEntryFeePerTeam,
      tiered: true,
      ageTierMissing: false,
    };
  }
  const { individual, team } = flattenFlatEntryFeeUnits(entryFee);
  return {
    individualUnit: individual,
    teamUnit: team,
    tiered: false,
    ageTierMissing: false,
  };
}

export function normalizeQualificationToken(item: unknown): string {
  return typeof item === "string" ? item.trim() : "";
}

export function parseFlatRequiredQualifications(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const xs = raw
    .map(normalizeQualificationToken)
    .filter((s) => s.length > 0);
  return Array.from(new Set(xs));
}

export function parseAgeQualificationTiers(raw: unknown): AgeQualificationTier[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const arr = o.ageQualificationTiers;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const allowed = new Set<string>(ALLOWED_ENTRY_REQUIRED_QUALIFICATIONS);
  const out: AgeQualificationTier[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const minAge = typeof t.minAge === "number" ? Math.floor(t.minAge) : NaN;
    const maxAge =
      t.maxAge === null || t.maxAge === undefined
        ? null
        : typeof t.maxAge === "number"
          ? Math.floor(t.maxAge)
          : NaN;
    if (!Number.isFinite(minAge) || minAge < 0) continue;
    if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) continue;
    const qualsRaw = t.requiredQualifications;
    if (!Array.isArray(qualsRaw)) continue;
    const requiredQualifications = Array.from(
      new Set(
        qualsRaw
          .map(normalizeQualificationToken)
          .filter((s) => s.length > 0 && allowed.has(s))
      )
    );
    out.push({ minAge, maxAge, requiredQualifications });
  }
  return out.length > 0 ? sortAgeTiers(out) : null;
}

export function isTieredRequiredQualifications(raw: unknown): boolean {
  return parseAgeQualificationTiers(raw) !== null;
}

export function resolveRequiredQualificationsForAge(
  raw: unknown,
  age: number | null
): { list: string[]; tiered: boolean; tierMissing: boolean } {
  const tiers = parseAgeQualificationTiers(raw);
  if (!tiers) {
    return {
      list: parseFlatRequiredQualifications(raw),
      tiered: false,
      tierMissing: false,
    };
  }
  if (age === null) {
    return { list: [], tiered: true, tierMissing: true };
  }
  const t = pickTierForAge(tiers, age);
  if (!t) {
    return { list: [], tiered: true, tierMissing: true };
  }
  return { list: t.requiredQualifications, tiered: true, tierMissing: false };
}

/** 一覧表示用: フラット配列と年齢帯別オブジェクトの両方から一意な資格ラベルを集約 */
export function unionRequiredQualifications(raw: unknown): string[] {
  const tiers = parseAgeQualificationTiers(raw);
  if (!tiers) return parseFlatRequiredQualifications(raw);
  const set = new Set<string>();
  for (const t of tiers) {
    for (const q of t.requiredQualifications) set.add(q);
  }
  return Array.from(set);
}

function requiredQualsAtAgeForCompare(raw: unknown, age: number): string[] {
  return resolveRequiredQualificationsForAge(raw, age).list;
}

export function isQualificationTighteningMulti(oldRaw: unknown, newRaw: unknown): boolean {
  for (let age = 0; age <= 120; age++) {
    const oldReq = new Set(requiredQualsAtAgeForCompare(oldRaw, age));
    for (const q of requiredQualsAtAgeForCompare(newRaw, age)) {
      if (!oldReq.has(q)) return true;
    }
  }
  return false;
}

export function isQualificationRelaxedMulti(oldRaw: unknown, newRaw: unknown): boolean {
  for (let age = 0; age <= 120; age++) {
    const newReq = new Set(requiredQualsAtAgeForCompare(newRaw, age));
    for (const q of requiredQualsAtAgeForCompare(oldRaw, age)) {
      if (!newReq.has(q)) return true;
    }
  }
  return false;
}

export function buildQualificationRelaxAnnouncementFromConfigs(
  oldRaw: unknown,
  newRaw: unknown,
  needsNotice: boolean
): string | undefined {
  if (!needsNotice) return undefined;
  const oldTiered = parseAgeQualificationTiers(oldRaw);
  const newTiered = parseAgeQualificationTiers(newRaw);
  if (!oldTiered && !newTiered) {
    const oldList = parseFlatRequiredQualifications(oldRaw);
    const newList = parseFlatRequiredQualifications(newRaw);
    const removed = oldList.filter((q) => !newList.includes(q));
    if (removed.length === 0) return undefined;
    return `出場に必要な資格を変更しました。次の要件は不要になりました：${removed.join("、")}。エントリー済みの参加者へ周知しました。`;
  }
  if (isQualificationRelaxedMulti(oldRaw, newRaw)) {
    return `年齢帯ごとの出場資格を変更しました。いずれかの年齢で要件が緩和されています。エントリー済みの参加者へ周知しました。`;
  }
  return undefined;
}

/** 参加費の年齢帯が大会の参加年齢範囲をすべて覆うか（任意だが設定時は推奨） */
export function validateAgeTiersNoOverlap<T extends { minAge: number; maxAge: number | null }>(
  tiers: T[]
): string | null {
  const sorted = sortAgeTiers(tiers);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevEnd = prev.maxAge ?? 1_000_000;
    if (cur.minAge <= prevEnd) {
      return "年齢帯が重複しています。境界が重ならないようにしてください。";
    }
  }
  return null;
}

export function validateAgeFeeTiersCoverCompetitionRange(
  tiers: AgeFeeTier[],
  competitionMinAge: number | null | undefined,
  competitionMaxAge: number | null | undefined
): string | null {
  if (typeof competitionMinAge !== "number" && typeof competitionMaxAge !== "number") {
    return null;
  }
  const lo =
    typeof competitionMinAge === "number" && competitionMinAge >= 0 ? competitionMinAge : 0;
  const hi =
    typeof competitionMaxAge === "number" && competitionMaxAge >= lo ? competitionMaxAge : lo;
  for (let age = lo; age <= hi; age++) {
    if (!pickTierForAge(tiers, age)) {
      return `大会の参加年齢（${lo}〜${hi}歳）のうち、${age}歳に該当する参加費の年齢帯がありません。`;
    }
  }
  return null;
}

export function validateAgeQualificationTiersCoverCompetitionRange(
  tiers: AgeQualificationTier[],
  competitionMinAge: number | null | undefined,
  competitionMaxAge: number | null | undefined
): string | null {
  if (typeof competitionMinAge !== "number" && typeof competitionMaxAge !== "number") {
    return null;
  }
  const lo =
    typeof competitionMinAge === "number" && competitionMinAge >= 0 ? competitionMinAge : 0;
  const hi =
    typeof competitionMaxAge === "number" && competitionMaxAge >= lo ? competitionMaxAge : lo;
  for (let age = lo; age <= hi; age++) {
    if (!pickTierForAge(tiers, age)) {
      return `大会の参加年齢（${lo}〜${hi}歳）のうち、${age}歳に該当する資格の年齢帯がありません。`;
    }
  }
  return null;
}

export function entryFeeReadinessOk(
  entryFee: unknown,
  hasIndividualEvents: boolean,
  hasTeamEvents: boolean
): boolean {
  const catTiers = parseAgeCategoryFeeTiers(entryFee);
  if (catTiers) {
    const indOk =
      !hasIndividualEvents ||
      catTiers.every((t) => Number.isFinite(t.individualEntryFee) && t.individualEntryFee >= 0);
    const teamOk =
      !hasTeamEvents || catTiers.every((t) => Number.isFinite(t.teamEntryFeePerTeam) && t.teamEntryFeePerTeam >= 0);
    return indOk && teamOk && catTiers.length > 0;
  }

  const tiers = parseAgeFeeTiers(entryFee);
  if (tiers) {
    const indOk =
      !hasIndividualEvents || tiers.every((t) => Number.isFinite(t.individualEntryFee) && t.individualEntryFee >= 0);
    const teamOk =
      !hasTeamEvents || tiers.every((t) => Number.isFinite(t.teamEntryFeePerTeam) && t.teamEntryFeePerTeam >= 0);
    return indOk && teamOk;
  }
  const { individual, team } = flattenFlatEntryFeeUnits(entryFee);
  const individualOk =
    !hasIndividualEvents || (Number.isFinite(individual) && !Number.isNaN(individual) && individual >= 0);
  const teamOk = !hasTeamEvents || (Number.isFinite(team) && !Number.isNaN(team) && team >= 0);
  return individualOk && teamOk;
}

/** 参加資格で「認定ライフセーバー」を選んだときの共通注釈（管理画面・マイページ・公開ページ） */
export const CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP =
  "「認定ライフセーバー」は、ウォーターセーフティ・BLS・選手登録に相当する条件（本アプリでは「BLS・WS」や選手登録の指定に含めます）の代替ではなく、それらとは別に必要とする上位資格を指します。";

export function requiredQualificationsMentionCertifiedLifesaver(raw: unknown): boolean {
  const tiered = parseAgeQualificationTiers(raw);
  if (tiered?.length) {
    return tiered.some((t) => t.requiredQualifications.includes("認定ライフセーバー"));
  }
  return unionRequiredQualifications(raw).includes("認定ライフセーバー");
}
