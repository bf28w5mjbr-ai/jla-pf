/**
 * 年齢カテゴリ名に含まれる「U-10」「U10」「10歳以下」風の表記からしきい値候補を集め、
 * `underAgeUThresholds` のたたき台を JSON で標準出力する（確定値ではない。OPEN の要否は手動）。
 *
 * Usage:
 *   pnpm suggest:under-u-from-categories -- <competitionId>
 */
import { prisma } from "@/server/db";

function parseArgs() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  return { competitionId: argv[0]?.trim() ?? "" };
}

/** カテゴリ名から想定しきい値（歳）の候補を列挙（重複可・後で Set 化） */
function thresholdsFromCategoryName(name: string): number[] {
  const out: number[] = [];
  const reU = /\bU\s*[-]?\s*(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reU.exec(name)) !== null) {
    const n = parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 99) out.push(n);
  }
  const below = name.match(/(\d{1,2})\s*歳\s*以下/);
  if (below) {
    const n = parseInt(below[1]!, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 99) out.push(n);
  }
  return out;
}

async function main() {
  const { competitionId } = parseArgs();
  if (!competitionId) {
    console.error("使い方: pnpm suggest:under-u-from-categories -- <competitionId>");
    process.exit(1);
  }

  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      startDate: true,
      ageCategories: { orderBy: { displayOrder: "asc" }, select: { name: true } },
    },
  });

  if (!comp) {
    console.error(`大会が見つかりません: ${competitionId}`);
    process.exit(1);
  }

  const perCategory: { name: string; suggestedThresholds: number[] }[] = [];
  const all = new Set<number>();
  for (const c of comp.ageCategories) {
    const suggested = thresholdsFromCategoryName(c.name);
    perCategory.push({ name: c.name, suggestedThresholds: suggested });
    for (const t of suggested) all.add(t);
  }

  const underAgeUThresholds = [...all].sort((a, b) => b - a);

  console.log(
    JSON.stringify(
      {
        competitionId: comp.id,
        competitionName: comp.name,
        startDate: comp.startDate?.toISOString() ?? null,
        note:
          "カテゴリ名の表記から推測した候補です。実際の年度年齢ルールと照合し、OPEN の有無は手動で設定してください。",
        perCategory,
        underAgeUThresholds,
      },
      null,
      2
    )
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
