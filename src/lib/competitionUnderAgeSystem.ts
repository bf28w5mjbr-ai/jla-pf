import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";

/**
 * 大会のアンダー制（年度年齢・U-○・OPEN）の仕様と純粋関数の置き場。
 * UI / Prisma 移行・料金・資格はこのルールに揃える。
 *
 * ## 年度（1周期）
 * - 4月2日 0:00（JST）〜翌年4月1日（JST）を1周期とする。
 * - 大会が属する周期は {@link inferUnderCycleBoundsFromCompetitionStart}（`startDate` 基準）。
 *
 * ## 「その年度で何歳になるか」（大会開催時の年齢判断）
 * - その周期のあいだに「満○歳になる日」が含まれるような ○ のうち**最大**を、その大会年度での年齢とする。
 *   （例: 周期内に18歳の誕生日があれば18。5月開催時点で暦上は17でも、判断上は18。）
 *
 * ## U-○ と OPEN
 * - **U-○**（単独）: ○歳**以下**（上記の年度年齢で判定）。
 * - **OPEN**: 有効な U の最大しきい値**より上**。他に U が一つもないときは**無差別**（年齢制限なし）。
 *
 * ## 複数 U のとき（被らない分割）
 * しきい値を昇順 `t1 < … < tk` とすると:
 * - U-t1: age ≤ t1
 * - U-t2: t1 < age ≤ t2
 * - …
 * - U-tk: t(k-1) < age ≤ tk
 * - **OPEN がオンのとき**: age > tk
 * - **OPEN がオフのとき（仕様 A）**: age > tk の者は**どの区分にも属さない**（エントリー不可・無差別扱いにしない）。
 *
 * ## 一律料金 vs アンダー別料金
 * - 一律のときは「年齢カテゴリ別料金」UIは使わない。
 * - アンダー別のときは区分ごとに 1 行（個人・チーム）。
 */

/** JST 暦日として解釈する（UTC 暦日フィールドと整合） */
export type CalendarDay = Date;

export type UnderCycleBounds = {
  cycleStart: CalendarDay;
  cycleEndInclusive: CalendarDay;
};

/**
 * `startDate` が入る「4/2〜翌4/1」の周期境界（暦日・端含む）。
 * startDate が 4/1 以前なら前年度の周期に含める、等の細則は実装時に固定する。
 */
export function inferUnderCycleBoundsFromCompetitionStart(
  competitionStartDate: Date
): UnderCycleBounds {
  const y = competitionStartDate.getUTCFullYear();
  const m = competitionStartDate.getUTCMonth() + 1;
  const d = competitionStartDate.getUTCDate();
  // 4月2日以降ならその年の周期、4月1日以前なら前年の周期（一般的な「年度」寄せ）
  const cycleYear = m > 4 || (m === 4 && d >= 2) ? y : y - 1;
  const cycleStart = new Date(Date.UTC(cycleYear, 3, 2));
  const cycleEndInclusive = new Date(Date.UTC(cycleYear + 1, 3, 1));
  return { cycleStart, cycleEndInclusive };
}

export type UnderTierBand = {
  /** 表示用 "U-10" 等 */
  label: string;
  maxThreshold: number;
  minAgeInclusive: number;
  maxAgeInclusive: number;
};

export type OpenBand = {
  kind: "OPEN";
  minAgeInclusive: number;
};

/**
 * 有効な U しきい値（重複除去昇順）と OPEN の有無から、被らない帯を返す。
 * `openEnabled === false` のとき、最上帯より上の年齢用の帯は返さない（仕様 A）。
 */
export function partitionUnderAgeBands(
  uThresholds: number[],
  openEnabled: boolean
): { underBands: UnderTierBand[]; openBand: OpenBand | null } {
  const sorted = [...new Set(uThresholds.filter((n) => Number.isFinite(n) && n >= 0))].sort(
    (a, b) => a - b
  );

  if (sorted.length === 0) {
    if (openEnabled) {
      // 他に U がないとき OPEN のみ＝無差別（0 歳以上すべて）
      return {
        underBands: [],
        openBand: { kind: "OPEN", minAgeInclusive: 0 },
      };
    }
    return { underBands: [], openBand: null };
  }

  const underBands: UnderTierBand[] = [];
  let prev = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const t = sorted[i]!;
    const minAgeInclusive = i === 0 ? 0 : prev + 1;
    underBands.push({
      label: `U-${t}`,
      maxThreshold: t,
      minAgeInclusive,
      maxAgeInclusive: t,
    });
    prev = t;
  }

  const openBand =
    openEnabled && sorted.length > 0
      ? { kind: "OPEN" as const, minAgeInclusive: prev + 1 }
      : null;

  return { underBands, openBand };
}

/**
 * 年度年齢が帯に入るか。OPEN 無しで max(U) より上なら false（仕様 A）。
 */
export function ageFitsUnderPartition(
  seasonalAge: number,
  bands: ReturnType<typeof partitionUnderAgeBands>
): boolean {
  const { underBands, openBand } = bands;
  if (underBands.length === 0) {
    if (openBand) return seasonalAge >= openBand.minAgeInclusive;
    return false;
  }
  for (const b of underBands) {
    if (seasonalAge >= b.minAgeInclusive && seasonalAge <= b.maxAgeInclusive) return true;
  }
  if (openBand && seasonalAge >= openBand.minAgeInclusive) return true;
  return false;
}

/**
 * 大会年度における「その年度で何歳になるか」。
 * 実装は {@link getCompetitionEligibilityAgeYears} に一致（4/2 始まり年度・翌年4/1 時点の満年齢）。
 */
export function computeSeasonalUnderAgeYears(
  dateOfBirth: Date,
  competitionStartDate: Date
): number {
  return getCompetitionEligibilityAgeYears(dateOfBirth, competitionStartDate);
}

/**
 * 年度年齢が属する料金・資格行のキー。該当なし（OPEN オフで帯外など）は null。
 * OPEN 帯のキーは常に `"OPEN"`。
 */
export function resolveUnderTierKeyForSeasonalAge(
  seasonalAge: number,
  bands: ReturnType<typeof partitionUnderAgeBands>
): string | null {
  const { underBands, openBand } = bands;
  for (const b of underBands) {
    if (seasonalAge >= b.minAgeInclusive && seasonalAge <= b.maxAgeInclusive) return b.label;
  }
  if (openBand && seasonalAge >= openBand.minAgeInclusive) return "OPEN";
  return null;
}

export function expectedUnderFeeTierKeys(
  bands: ReturnType<typeof partitionUnderAgeBands>
): string[] {
  const keys = bands.underBands.map((b) => b.label);
  if (bands.openBand) keys.push("OPEN");
  return keys;
}
