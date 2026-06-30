import { prisma } from "@/server/db";
import { buildAgeCategoryTemplateRows } from "@/lib/seasonalAgeToBirthDateRange";

export function normalizeUnderAgeThresholds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const xs = raw
    .map((x) => {
      if (typeof x === "number") return Math.floor(x);
      if (typeof x === "string" && x.trim() !== "") {
        const n = parseInt(x.trim(), 10);
        return Number.isFinite(n) ? Math.floor(n) : NaN;
      }
      return NaN;
    })
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 150);
  return Array.from(new Set(xs)).sort((a, b) => a - b);
}

/**
 * U/OPEN しきい値から AGEカテゴリを生成・同期する。
 * 既存カテゴリと **名前** で突き合わせ:
 *   - 同名があれば eligibleBirthDateFrom / eligibleBirthDateTo / displayOrder を上書き
 *   - 無ければ追加
 * テンプレ外の既存カテゴリは触らない（手動追加分の保護）。
 */
export async function syncAgeCategoriesFromUnderAge(
  competitionId: string,
  competitionStartDate: Date,
  uThresholds: number[],
  openEnabled: boolean
): Promise<number> {
  const rows = buildAgeCategoryTemplateRows(competitionStartDate, uThresholds, openEnabled);
  if (rows.length === 0) return 0;

  const existing = await prisma.competitionAgeCategory.findMany({
    where: { competitionId },
    orderBy: { displayOrder: "asc" },
  });
  const byName = new Map(existing.map((c) => [c.name, c] as const));
  const templateNames = new Set(rows.map((r) => r.name));

  let order = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const exists = byName.get(row.name);
      if (exists) {
        await tx.competitionAgeCategory.update({
          where: { id: exists.id },
          data: {
            displayOrder: order,
            eligibleBirthDateFrom: row.eligibleBirthDateFrom,
            eligibleBirthDateTo: row.eligibleBirthDateTo,
          },
        });
      } else {
        await tx.competitionAgeCategory.create({
          data: {
            competitionId,
            name: row.name,
            displayOrder: order,
            eligibleBirthDateFrom: row.eligibleBirthDateFrom,
            eligibleBirthDateTo: row.eligibleBirthDateTo,
          },
        });
      }
      order += 1;
    }
    const extras = existing.filter((c) => !templateNames.has(c.name));
    for (const c of extras) {
      await tx.competitionAgeCategory.update({
        where: { id: c.id },
        data: { displayOrder: order },
      });
      order += 1;
    }
  });

  return rows.length;
}
