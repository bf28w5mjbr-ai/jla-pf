/** 大会エントリーの参加費・必須資格を年齢帯別に扱う（JSON 保存形式の解釈と検証）
 *
 * このモジュールは「年齢カテゴリ（CompetitionAgeCategory）に一本化」した世界で動く。
 * かつてのアンダー区分別（underFeeTiers / underQualificationTiers）は廃止し、
 * 年齢カテゴリ ID をキーにした ageCategoryFeeTiers / ageCategoryQualificationTiers のみを扱う。
 * アンダー制（U-○/OPEN）は AGEカテゴリを生成するためのテンプレート扱いで、
 * このファイルからは見えない。
 */

import {
  eventUsesBirthDateRange,
  isUserDobInEventBirthDateRange,
} from "@/lib/eventBirthDateEligibility";
import { normalizeQualificationKind } from "@/lib/qualificationTemplateRules";

export const ALLOWED_ENTRY_REQUIRED_QUALIFICATIONS = [
  "選手登録",
  "BLS・WS",
  "認定ライフセーバー",
] as const;
export const ENTRY_REQUIRED_CERTIFIED_LIFESAVER = "認定ライフセーバー";

export type EntryQualificationTemplateOption = {
  id?: string;
  name: string;
  kind?: string | null;
};

/**
 * 「認定ライフセーバー」一括選択マクロから除外する資格（kind/name のいずれかが一致したらマクロ対象外）。
 * 選手登録・BLS・WaterSafety・Referee系（C/B/A/S）は単独で取り扱うため、マクロでは選択しない。
 */
const CERTIFIED_LIFESAVER_MACRO_EXCLUDED_KINDS = [
  "選手登録",
  "BLS",
  "WaterSafety",
  "ウォーターセーフティ",
  "RefereeC",
  "RefereeB",
  "RefereeA",
  "RefereeS",
  "審判C",
  "審判B",
  "審判A",
  "審判S",
];

const CERTIFIED_LIFESAVER_MACRO_EXCLUDED_NORMALIZED = new Set(
  CERTIFIED_LIFESAVER_MACRO_EXCLUDED_KINDS.map((item) => normalizeQualificationKind(item)).filter(
    (item) => item.length > 0
  )
);

function toAllowedSet(
  allowedQualifications?: ReadonlySet<string> | readonly string[] | null
): Set<string> | null {
  if (!allowedQualifications) return null;
  if (Array.isArray(allowedQualifications)) {
    return new Set(
      allowedQualifications.map((item) => normalizeQualificationToken(item)).filter((item) => item.length > 0)
    );
  }
  return new Set(
    Array.from(allowedQualifications.values())
      .map((item) => normalizeQualificationToken(item))
      .filter((item) => item.length > 0)
  );
}

export function isCertifiedLifesaverUpperQualification(value: string): boolean {
  const normalized = normalizeQualificationKind(value);
  if (!normalized) return false;
  if (normalized === normalizeQualificationKind(ENTRY_REQUIRED_CERTIFIED_LIFESAVER)) return false;
  if (CERTIFIED_LIFESAVER_MACRO_EXCLUDED_NORMALIZED.has(normalized)) return false;
  return true;
}

export function getCertifiedLifesaverUpperQualifications(options: readonly string[]): string[] {
  return options.filter(
    (option) =>
      option !== ENTRY_REQUIRED_CERTIFIED_LIFESAVER &&
      isCertifiedLifesaverUpperQualification(option)
  );
}

export function deriveEntryQualificationOptionsFromTemplates(
  templates: EntryQualificationTemplateOption[]
): string[] {
  const normalizedTemplates = templates
    .map((template) => (template.name || template.kind || "").trim())
    .filter((item) => item.length > 0);
  const unique = Array.from(new Set(normalizedTemplates));
  return [ENTRY_REQUIRED_CERTIFIED_LIFESAVER, ...unique];
}

export function normalizeEntryRequiredQualifications(
  values: unknown[],
  options?: {
    allowedQualifications?: ReadonlySet<string> | readonly string[] | null;
    expandCertifiedLifesaverMacro?: boolean;
  }
): string[] {
  const allowed = toAllowedSet(options?.allowedQualifications);
  const expandMacro = options?.expandCertifiedLifesaverMacro ?? false;
  const list = Array.from(
    new Set(
      values
        .map(normalizeQualificationToken)
        .filter((value) => value.length > 0 && (!allowed || allowed.has(value)))
    )
  );
  if (!expandMacro || !list.includes(ENTRY_REQUIRED_CERTIFIED_LIFESAVER)) {
    return list;
  }
  const upper = Array.from(allowed ?? []).filter((q) => isCertifiedLifesaverUpperQualification(q));
  return Array.from(new Set([...list, ...upper]));
}

export function applyEntryQualificationToggleWithCertifiedMacro(
  current: readonly string[],
  toggled: string,
  options: readonly string[]
): string[] {
  const normalizedCurrent = Array.from(
    new Set(current.map(normalizeQualificationToken).filter((item) => item.length > 0))
  );
  const nextSet = new Set(normalizedCurrent);
  if (nextSet.has(toggled)) {
    nextSet.delete(toggled);
  } else {
    nextSet.add(toggled);
  }

  const upper = getCertifiedLifesaverUpperQualifications(options);
  const hasMacro = nextSet.has(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);

  if (toggled === ENTRY_REQUIRED_CERTIFIED_LIFESAVER) {
    if (hasMacro) {
      for (const item of upper) nextSet.add(item);
    } else {
      for (const item of upper) nextSet.delete(item);
    }
  } else if (upper.includes(toggled) && hasMacro) {
    const allUpperSelected = upper.every((item) => nextSet.has(item));
    if (!allUpperSelected) {
      nextSet.delete(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
    }
  } else if (!hasMacro && upper.length > 0) {
    const allUpperSelected = upper.every((item) => nextSet.has(item));
    if (allUpperSelected) {
      nextSet.add(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
    }
  }

  return Array.from(nextSet);
}

export function compactCertifiedLifesaverExpandedQualifications(values: readonly string[]): string[] {
  const list = Array.from(new Set(values.map(normalizeQualificationToken).filter((item) => item.length > 0)));
  if (!list.includes(ENTRY_REQUIRED_CERTIFIED_LIFESAVER)) return list;
  return list.filter(
    (item) =>
      item === ENTRY_REQUIRED_CERTIFIED_LIFESAVER || !isCertifiedLifesaverUpperQualification(item)
  );
}

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

/** 大会の CompetitionAgeCategory.id ごとの必須資格（JSON: ageCategoryQualificationTiers） */
export type AgeCategoryQualificationTier = {
  ageCategoryId: string;
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

/** 廃止した「年齢帯別」参加費（min/max 満年齢帯）が保存されているか */
export function hasLegacyAgeBandEntryFee(entryFee: unknown): boolean {
  return parseAgeFeeTiers(entryFee) !== null;
}

/** 廃止した「年齢帯別」必須資格が保存されているか */
export function hasLegacyAgeBandQualifications(raw: unknown): boolean {
  return parseAgeQualificationTiers(raw) !== null;
}

export const LEGACY_AGE_BAND_ENTRY_FEE_MESSAGE =
  "年齢帯別の参加費は廃止しました。全員同一または AGEカテゴリ別を指定してください。";

export const LEGACY_AGE_BAND_QUALIFICATIONS_MESSAGE =
  "年齢帯別の参加資格は廃止しました。全員同一または AGEカテゴリ別を指定してください。";

/**
 * 年齢カテゴリ別／年齢帯別の各ティアに載っている teamEntryFeePerTeam の最大値。
 * クラブ管理者の生年月日がどのティアにも入らないときのチーム請求単価のフォールバックに使う。
 */
export function maxTeamEntryFeeUnitAcrossTiers(entryFee: unknown): number | null {
  const cat = parseAgeCategoryFeeTiers(entryFee);
  if (cat && cat.length > 0) {
    return Math.max(...cat.map((t) => t.teamEntryFeePerTeam));
  }
  const age = parseAgeFeeTiers(entryFee);
  if (age && age.length > 0) {
    return Math.max(...age.map((t) => t.teamEntryFeePerTeam));
  }
  return null;
}

/**
 * 年齢カテゴリ別／年齢帯別の各ティアに載っている individualEntryFee の最大値。
 * 個人エントリーでチーム種目のみかつティア解決不能時のフォールバックに使う（{@link maxTeamEntryFeeUnitAcrossTiers} と対称）。
 */
export function maxIndividualEntryFeeUnitAcrossTiers(entryFee: unknown): number | null {
  const cat = parseAgeCategoryFeeTiers(entryFee);
  if (cat && cat.length > 0) {
    return Math.max(...cat.map((t) => t.individualEntryFee));
  }
  const age = parseAgeFeeTiers(entryFee);
  if (age && age.length > 0) {
    return Math.max(...age.map((t) => t.individualEntryFee));
  }
  return null;
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

export function parseFlatRequiredQualifications(
  raw: unknown,
  allowedQualifications?: ReadonlySet<string> | readonly string[] | null
): string[] {
  if (!Array.isArray(raw)) return [];
  return normalizeEntryRequiredQualifications(raw, {
    allowedQualifications,
    expandCertifiedLifesaverMacro: true,
  });
}

export function parseAgeQualificationTiers(
  raw: unknown,
  allowedQualifications?: ReadonlySet<string> | readonly string[] | null
): AgeQualificationTier[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const arr = o.ageQualificationTiers;
  if (!Array.isArray(arr) || arr.length === 0) return null;
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
    const requiredQualifications = normalizeEntryRequiredQualifications(qualsRaw, {
      allowedQualifications,
      expandCertifiedLifesaverMacro: true,
    });
    out.push({ minAge, maxAge, requiredQualifications });
  }
  return out.length > 0 ? sortAgeTiers(out) : null;
}

export function parseAgeCategoryQualificationTiers(
  raw: unknown,
  allowedQualifications?: ReadonlySet<string> | readonly string[] | null
): AgeCategoryQualificationTier[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const arr = o.ageCategoryQualificationTiers;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return normalizeAgeCategoryQualificationTiersInput(arr, allowedQualifications);
}

/** PUT リクエスト body の配列から正規化（DB 照合は呼び出し側） */
export function normalizeAgeCategoryQualificationTiersInput(
  items: unknown[],
  allowedQualifications?: ReadonlySet<string> | readonly string[] | null
): AgeCategoryQualificationTier[] | null {
  const out: AgeCategoryQualificationTier[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const ageCategoryId = typeof t.ageCategoryId === "string" ? t.ageCategoryId.trim() : "";
    const qualsRaw = t.requiredQualifications;
    if (!ageCategoryId) continue;
    if (!Array.isArray(qualsRaw)) continue;
    const requiredQualifications = normalizeEntryRequiredQualifications(qualsRaw, {
      allowedQualifications,
      expandCertifiedLifesaverMacro: true,
    });
    out.push({ ageCategoryId, requiredQualifications });
  }
  return out.length > 0 ? out : null;
}

export function isTieredRequiredQualifications(raw: unknown): boolean {
  return (
    parseAgeQualificationTiers(raw) !== null || parseAgeCategoryQualificationTiers(raw) !== null
  );
}

/** 年齢カテゴリ ID 解決（生年月日 → ageCategoryId）と組み合わせて使う */
export function resolveRequiredQualificationsForAgeCategory(
  raw: unknown,
  ageCategoryId: string | null
): { list: string[]; tiered: boolean; tierMissing: boolean } {
  const catTiers = parseAgeCategoryQualificationTiers(raw);
  if (catTiers) {
    if (!ageCategoryId) {
      return { list: [], tiered: true, tierMissing: true };
    }
    const row = catTiers.find((t) => t.ageCategoryId === ageCategoryId);
    if (!row) {
      return { list: [], tiered: true, tierMissing: true };
    }
    return {
      list: compactCertifiedLifesaverExpandedQualifications(row.requiredQualifications),
      tiered: true,
      tierMissing: false,
    };
  }
  return {
    list: compactCertifiedLifesaverExpandedQualifications(parseFlatRequiredQualifications(raw)),
    tiered: false,
    tierMissing: false,
  };
}

export function resolveRequiredQualificationsForAge(
  raw: unknown,
  age: number | null
): { list: string[]; tiered: boolean; tierMissing: boolean } {
  const tiers = parseAgeQualificationTiers(raw);
  if (!tiers) {
    return {
      list: compactCertifiedLifesaverExpandedQualifications(parseFlatRequiredQualifications(raw)),
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
  return {
    list: compactCertifiedLifesaverExpandedQualifications(t.requiredQualifications),
    tiered: true,
    tierMissing: false,
  };
}

/** 一覧表示用: フラット配列・年齢帯別・年齢カテゴリ別のいずれからも一意な資格ラベルを集約 */
export function unionRequiredQualifications(raw: unknown): string[] {
  const catTiers = parseAgeCategoryQualificationTiers(raw);
  if (catTiers?.length) {
    const set = new Set<string>();
    for (const t of catTiers) {
      for (const q of t.requiredQualifications) set.add(q);
    }
    return compactCertifiedLifesaverExpandedQualifications(Array.from(set));
  }
  const tiers = parseAgeQualificationTiers(raw);
  if (!tiers) return parseFlatRequiredQualifications(raw);
  const set = new Set<string>();
  for (const t of tiers) {
    for (const q of t.requiredQualifications) set.add(q);
  }
  return compactCertifiedLifesaverExpandedQualifications(Array.from(set));
}

/**
 * 年齢別の必須資格（minAge/maxAge ベース）に絞った緩和判定。
 * 年齢カテゴリ別（ageCategoryQualificationTiers）の判定は別関数 {@link isQualificationTighteningByAgeCategory} を使う。
 */
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

/** 年齢カテゴリ別の必須資格を、各カテゴリ ID ごとに比較。新規追加要件があるか */
export function isQualificationTighteningByAgeCategory(oldRaw: unknown, newRaw: unknown): boolean {
  const oldTiers = parseAgeCategoryQualificationTiers(oldRaw);
  const newTiers = parseAgeCategoryQualificationTiers(newRaw);
  if (!oldTiers && !newTiers) return false;
  const ids = new Set<string>();
  for (const t of oldTiers ?? []) ids.add(t.ageCategoryId);
  for (const t of newTiers ?? []) ids.add(t.ageCategoryId);
  for (const id of ids) {
    const oldList = compactCertifiedLifesaverExpandedQualifications(
      oldTiers?.find((t) => t.ageCategoryId === id)?.requiredQualifications ?? []
    );
    const newList = compactCertifiedLifesaverExpandedQualifications(
      newTiers?.find((t) => t.ageCategoryId === id)?.requiredQualifications ?? []
    );
    const oldSet = new Set(oldList);
    for (const q of newList) {
      if (!oldSet.has(q)) return true;
    }
  }
  return false;
}

export function isQualificationRelaxedByAgeCategory(oldRaw: unknown, newRaw: unknown): boolean {
  const oldTiers = parseAgeCategoryQualificationTiers(oldRaw);
  const newTiers = parseAgeCategoryQualificationTiers(newRaw);
  if (!oldTiers && !newTiers) return false;
  const ids = new Set<string>();
  for (const t of oldTiers ?? []) ids.add(t.ageCategoryId);
  for (const t of newTiers ?? []) ids.add(t.ageCategoryId);
  for (const id of ids) {
    const oldList = compactCertifiedLifesaverExpandedQualifications(
      oldTiers?.find((t) => t.ageCategoryId === id)?.requiredQualifications ?? []
    );
    const newList = compactCertifiedLifesaverExpandedQualifications(
      newTiers?.find((t) => t.ageCategoryId === id)?.requiredQualifications ?? []
    );
    const newSet = new Set(newList);
    for (const q of oldList) {
      if (!newSet.has(q)) return true;
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
  const oldCat = parseAgeCategoryQualificationTiers(oldRaw);
  const newCat = parseAgeCategoryQualificationTiers(newRaw);
  if (oldCat || newCat) {
    if (isQualificationRelaxedByAgeCategory(oldRaw, newRaw)) {
      return `出場資格（AGEカテゴリ別）を変更しました。いずれかのカテゴリで要件が緩和されています。エントリー済みの参加者へ周知しました。`;
    }
    return undefined;
  }
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

/** ageCategoryFeeTiers の各行が、与えた既知の年齢カテゴリ ID 集合と一致しているか */
export function validateAgeCategoryFeeTiersAgainstCategories(
  tiers: AgeCategoryFeeTier[],
  knownAgeCategoryIds: ReadonlySet<string>
): string | null {
  const got = new Set(tiers.map((t) => t.ageCategoryId));
  for (const id of knownAgeCategoryIds) {
    if (!got.has(id)) {
      return `参加費にカテゴリ「${id}」の行がありません。`;
    }
  }
  for (const id of got) {
    if (!knownAgeCategoryIds.has(id)) {
      return `参加費に不明なカテゴリ ID「${id}」が含まれています。`;
    }
  }
  return null;
}

/** ageCategoryQualificationTiers の各行が、既知の年齢カテゴリ ID 集合と一致しているか */
export function validateAgeCategoryQualificationTiersAgainstCategories(
  tiers: AgeCategoryQualificationTier[],
  knownAgeCategoryIds: ReadonlySet<string>
): string | null {
  const got = new Set(tiers.map((t) => t.ageCategoryId));
  for (const id of knownAgeCategoryIds) {
    if (!got.has(id)) {
      return `AGEカテゴリ別の資格にカテゴリ「${id}」の行がありません。`;
    }
  }
  for (const id of got) {
    if (!knownAgeCategoryIds.has(id)) {
      return `AGEカテゴリ別の資格に不明なカテゴリ ID「${id}」が含まれています。`;
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
  "「認定ライフセーバー」を選択すると、選手登録・BLS・WaterSafety・審判（RefereeC〜S）を除くすべての資格を一括で設定できます。判定時は、対象資格のいずれかを保有していれば要件を満たします。";

export function requiredQualificationsMentionCertifiedLifesaver(raw: unknown): boolean {
  const tiered = parseAgeQualificationTiers(raw);
  if (tiered?.length) {
    return tiered.some((t) =>
      compactCertifiedLifesaverExpandedQualifications(t.requiredQualifications).includes(
        ENTRY_REQUIRED_CERTIFIED_LIFESAVER
      )
    );
  }
  const cats = parseAgeCategoryQualificationTiers(raw);
  if (cats?.length) {
    return cats.some((t) =>
      compactCertifiedLifesaverExpandedQualifications(t.requiredQualifications).includes(
        ENTRY_REQUIRED_CERTIFIED_LIFESAVER
      )
    );
  }
  return unionRequiredQualifications(raw).includes(ENTRY_REQUIRED_CERTIFIED_LIFESAVER);
}
