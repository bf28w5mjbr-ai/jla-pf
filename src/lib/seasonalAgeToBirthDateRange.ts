/**
 * 年度年齢 (U-N / OPEN) と生年月日レンジの相互変換。
 *
 * 「アンダー制」は AGE カテゴリ（生年月日レンジ）を一括生成するためのテンプレートに過ぎない。
 * このモジュールは「U-N の数値」から「eligibleBirthDateFrom / eligibleBirthDateTo」を計算し、
 * テンプレ生成時に AGEカテゴリへ反映するために使う。
 *
 * 年度は {@link eligibilityFiscalYearLabelApril2Start} と整合する 4/2 始まりで判定。
 * asOf は (fiscalYear + 1, 4, 1)（翌年4月1日）。
 */

import { eligibilityFiscalYearLabelApril2Start } from "@/lib/competitionEligibilityAge";
import { partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";

/** Prisma の @db.Date と整合する UTC 暦日の Date */
function utcCalendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** 1帯（U-○ または OPEN）に対応する AGEカテゴリ・テンプレート */
export type AgeCategoryTemplateRow = {
  /** "U-15" / "OPEN" 等の表示名（AGEカテゴリの name に使う） */
  name: string;
  /** 種別（OPEN 行のみ "OPEN"、それ以外は "UNDER"） */
  kind: "UNDER" | "OPEN";
  /** 最小年齢（U-○ では下帯から決まる minAgeInclusive、OPEN では最大Uしきい値+1） */
  minAgeInclusive: number;
  /** 最大年齢（U-○ では maxAgeInclusive、OPEN では null = 上限なし） */
  maxAgeInclusive: number | null;
  /** 生年月日レンジ（UTC 暦日）。null = 上下限なし */
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
};

/**
 * 「大会の年度（4/2 始まり）」と「U の年齢」から、生年月日レンジを算出する。
 *
 *  - 年齢 N（age ≤ N）の上限: 生まれた日が「(asOf年 - N - 1), 4, 2」以降。
 *  - 年齢 N（age ≥ N）の下限: 生まれた日が「(asOf年 - N), 4, 1」以前。
 *
 * minAgeInclusive=0 / maxAgeInclusive=null（OPEN 上端）は対応するレンジ端を null とする。
 */
export function birthDateRangeForSeasonalAgeBand(
  competitionStartDate: Date,
  minAgeInclusive: number,
  maxAgeInclusive: number | null
): { eligibleBirthDateFrom: Date | null; eligibleBirthDateTo: Date | null } {
  const fy = eligibilityFiscalYearLabelApril2Start(competitionStartDate);
  // asOf = (fy + 1, 4, 1)
  // 年齢 a → 生まれた日は [(fy - a, 4, 2), (fy - a + 1, 4, 1)]
  // 範囲 [minAge, maxAge] →
  //   from = (fy - maxAge, 4, 2)   (maxAge=null なら from なし)
  //   to   = (fy - minAge + 1, 4, 1) (minAge=0 なら to = (fy + 1, 4, 1))
  // ただし「minAge=0 でも to を埋める」と「未来生まれは不可」になり実害があるため、
  // minAge=0 のときは to を null（=上限なし）とする。
  const eligibleBirthDateFrom =
    maxAgeInclusive === null ? null : utcCalendarDate(fy - maxAgeInclusive, 4, 2);
  const eligibleBirthDateTo =
    minAgeInclusive <= 0 ? null : utcCalendarDate(fy - minAgeInclusive + 1, 4, 1);
  return { eligibleBirthDateFrom, eligibleBirthDateTo };
}

/**
 * U のしきい値（昇順）と OPEN フラグ・大会開始日から、AGEカテゴリのテンプレート行を返す。
 *
 *  - U-t1 (age 0..t1)
 *  - U-t2 (age t1+1..t2)
 *  - …
 *  - U-tk (age tk-1+1..tk)
 *  - OPEN  (age tk+1..∞)   ← openEnabled === true のときだけ
 *
 * しきい値が空 + openEnabled のときは 1 件だけ「OPEN（無差別）」を返す。
 * しきい値が空 + !openEnabled のときは [] を返す。
 */
export function buildAgeCategoryTemplateRows(
  competitionStartDate: Date,
  uThresholds: number[],
  openEnabled: boolean
): AgeCategoryTemplateRow[] {
  const part = partitionUnderAgeBands(uThresholds, openEnabled);
  const rows: AgeCategoryTemplateRow[] = [];
  for (const band of part.underBands) {
    const { eligibleBirthDateFrom, eligibleBirthDateTo } = birthDateRangeForSeasonalAgeBand(
      competitionStartDate,
      band.minAgeInclusive,
      band.maxAgeInclusive
    );
    rows.push({
      name: band.label,
      kind: "UNDER",
      minAgeInclusive: band.minAgeInclusive,
      maxAgeInclusive: band.maxAgeInclusive,
      eligibleBirthDateFrom,
      eligibleBirthDateTo,
    });
  }
  if (part.openBand) {
    const min = part.openBand.minAgeInclusive;
    const { eligibleBirthDateFrom, eligibleBirthDateTo } = birthDateRangeForSeasonalAgeBand(
      competitionStartDate,
      min,
      null
    );
    rows.push({
      name: "OPEN",
      kind: "OPEN",
      minAgeInclusive: min,
      maxAgeInclusive: null,
      eligibleBirthDateFrom,
      eligibleBirthDateTo,
    });
  }
  return rows;
}
