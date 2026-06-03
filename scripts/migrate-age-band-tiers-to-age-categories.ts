/**
 * 廃止予定の「年齢帯別」（ageFeeTiers / ageQualificationTiers）を
 * AGEカテゴリ別（ageCategoryFeeTiers / ageCategoryQualificationTiers）へ変換する。
 *
 * 各 AGEカテゴリの生年月日下限を代表として満年齢を算出し、該当する年齢帯 tier を引き当てます。
 * 上限・下限の両端で異なる tier に入る場合はスキップします。
 *
 * Usage:
 *   pnpm tsx scripts/migrate-age-band-tiers-to-age-categories.ts --dry-run
 *   pnpm tsx scripts/migrate-age-band-tiers-to-age-categories.ts --apply
 *
 * Options:
 *   --dry-run
 *   --apply
 *   --competitionId=<cuid>
 */
import { getCompetitionEligibilityAgeYears } from "@/lib/competitionEligibilityAge";
import {
  parseAgeCategoryFeeTiers,
  parseAgeCategoryQualificationTiers,
  parseAgeFeeTiers,
  parseAgeQualificationTiers,
  pickTierForAge,
  type AgeFeeTier,
  type AgeQualificationTier,
} from "@/lib/competitionEntryAgeTiered";
import { eventUsesBirthDateRange } from "@/lib/eventBirthDateEligibility";
import { prisma } from "@/server/db";

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  let competitionId: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--competitionId=")) {
      competitionId = a.slice("--competitionId=".length).trim() || null;
    }
  }
  return { dryRun, competitionId };
}

function readObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

type AgeCategoryRow = {
  id: string;
  name: string;
  displayOrder: number;
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
};

function agesForCategorySampling(
  cat: AgeCategoryRow,
  competitionStartDate: Date
): { fromAge: number | null; toAge: number | null } {
  const from = cat.eligibleBirthDateFrom;
  const to = cat.eligibleBirthDateTo;
  const fromAge = from ? getCompetitionEligibilityAgeYears(from, competitionStartDate) : null;
  const toAge = to ? getCompetitionEligibilityAgeYears(to, competitionStartDate) : null;
  return { fromAge, toAge };
}

function pickFeeTierForCategory(
  tiers: AgeFeeTier[],
  cat: AgeCategoryRow,
  competitionStartDate: Date
): { tier: AgeFeeTier | null; reason?: string } {
  const { fromAge, toAge } = agesForCategorySampling(cat, competitionStartDate);
  const sampleAges = [fromAge, toAge].filter((a): a is number => a !== null);
  if (sampleAges.length === 0) {
    return { tier: null, reason: `カテゴリ「${cat.name}」の生年月日範囲から年齢を算出できません` };
  }
  const matched = sampleAges.map((age) => pickTierForAge(tiers, age));
  const first = matched[0];
  if (!first) {
    return { tier: null, reason: `カテゴリ「${cat.name}」に該当する参加費の年齢帯がありません` };
  }
  for (let i = 1; i < matched.length; i++) {
    const t = matched[i];
    if (!t || t.minAge !== first.minAge || t.maxAge !== first.maxAge) {
      return {
        tier: null,
        reason: `カテゴリ「${cat.name}」の生年月日範囲が複数の参加費帯にまたがります`,
      };
    }
  }
  return { tier: first };
}

function pickQualTierForCategory(
  tiers: AgeQualificationTier[],
  cat: AgeCategoryRow,
  competitionStartDate: Date
): { tier: AgeQualificationTier | null; reason?: string } {
  const { fromAge, toAge } = agesForCategorySampling(cat, competitionStartDate);
  const sampleAges = [fromAge, toAge].filter((a): a is number => a !== null);
  if (sampleAges.length === 0) {
    return { tier: null, reason: `カテゴリ「${cat.name}」の生年月日範囲から年齢を算出できません` };
  }
  const matched = sampleAges.map((age) => pickTierForAge(tiers, age));
  const first = matched[0];
  if (!first) {
    return { tier: null, reason: `カテゴリ「${cat.name}」に該当する資格の年齢帯がありません` };
  }
  for (let i = 1; i < matched.length; i++) {
    const t = matched[i];
    if (!t || t.minAge !== first.minAge || t.maxAge !== first.maxAge) {
      return {
        tier: null,
        reason: `カテゴリ「${cat.name}」の生年月日範囲が複数の資格帯にまたがります`,
      };
    }
  }
  return { tier: first };
}

async function main() {
  const { dryRun, competitionId } = parseArgs();
  const competitions = await prisma.competition.findMany({
    where: competitionId ? { id: competitionId } : undefined,
    select: {
      id: true,
      name: true,
      startDate: true,
      entryFee: true,
      requiredQualifications: true,
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          displayOrder: true,
          eligibleBirthDateFrom: true,
          eligibleBirthDateTo: true,
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  let touched = 0;
  for (const c of competitions) {
    const feeBands = parseAgeFeeTiers(c.entryFee);
    const qualBands = parseAgeQualificationTiers(c.requiredQualifications);
    if (!feeBands && !qualBands) continue;
    if (parseAgeCategoryFeeTiers(c.entryFee) || parseAgeCategoryQualificationTiers(c.requiredQualifications)) {
      console.log(`\n[skip] ${c.id} "${c.name}" — すでに AGEカテゴリ別 tier があります`);
      continue;
    }
    if (c.ageCategories.length === 0) {
      console.log(`\n[skip] ${c.id} "${c.name}" — AGEカテゴリがありません`);
      continue;
    }

    const startDate = new Date(c.startDate);
    const cats = c.ageCategories as AgeCategoryRow[];
    const missingRange = cats.filter((cat) => !eventUsesBirthDateRange(cat));
    if (missingRange.length > 0) {
      console.log(
        `\n[skip] ${c.id} "${c.name}" — 生年月日範囲未設定: ${missingRange.map((x) => x.name).join(", ")}`
      );
      continue;
    }

    console.log(
      `\n[${dryRun ? "dry-run" : "apply"}] ${c.id} "${c.name}" feeBands=${feeBands?.length ?? 0} qualBands=${qualBands?.length ?? 0} categories=${cats.length}`
    );

    const feeByCat: {
      ageCategoryId: string;
      individualEntryFee: number;
      teamEntryFeePerTeam: number;
    }[] = [];
    const qualByCat: { ageCategoryId: string; requiredQualifications: string[] }[] = [];

    for (const cat of cats) {
      if (feeBands) {
        const { tier, reason } = pickFeeTierForCategory(feeBands, cat, startDate);
        if (!tier) {
          console.log(`  [skip] ${reason}`);
          feeByCat.length = 0;
          break;
        }
        feeByCat.push({
          ageCategoryId: cat.id,
          individualEntryFee: tier.individualEntryFee,
          teamEntryFeePerTeam: tier.teamEntryFeePerTeam,
        });
      }
      if (qualBands) {
        const { tier, reason } = pickQualTierForCategory(qualBands, cat, startDate);
        if (!tier) {
          console.log(`  [skip] ${reason}`);
          qualByCat.length = 0;
          break;
        }
        qualByCat.push({
          ageCategoryId: cat.id,
          requiredQualifications: [...tier.requiredQualifications],
        });
      }
    }

    if (feeBands && feeByCat.length !== cats.length) continue;
    if (qualBands && qualByCat.length !== cats.length) continue;

    if (feeByCat.length > 0) {
      console.log(`  [fee] ${feeByCat.length} categories`);
      for (const row of feeByCat) {
        const name = cats.find((x) => x.id === row.ageCategoryId)?.name ?? row.ageCategoryId;
        console.log(
          `    ${name}: 個人=${row.individualEntryFee} チーム=${row.teamEntryFeePerTeam}`
        );
      }
    }
    if (qualByCat.length > 0) {
      console.log(`  [qual] ${qualByCat.length} categories`);
    }

    if (!dryRun) {
      if (feeByCat.length > 0) {
        const next = readObject(c.entryFee) ?? {};
        delete next.ageFeeTiers;
        delete next.pricingMode;
        next.ageCategoryFeeTiers = feeByCat;
        await prisma.competition.update({
          where: { id: c.id },
          data: { entryFee: next as object },
        });
      }
      if (qualByCat.length > 0) {
        await prisma.competition.update({
          where: { id: c.id },
          data: {
            requiredQualifications: { ageCategoryQualificationTiers: qualByCat } as object,
          },
        });
      }
    }
    touched += 1;
  }

  console.log(`\nDone. ${touched} competition(s) ${dryRun ? "would be" : ""} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
