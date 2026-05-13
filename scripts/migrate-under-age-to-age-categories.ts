/**
 * 旧アンダー制（underFeeTiers / underQualificationTiers / underBandKeysOverride）を、
 * AGEカテゴリ（CompetitionAgeCategory）系へ変換するワンショットスクリプト。
 *
 * 動作:
 *   1. 各 Competition について、underAgeUThresholds + underAgeOpenEnabled から
 *      AGEカテゴリ・テンプレ行を再生成し、name 一致で upsert（無ければ追加・あれば from/to 上書き）。
 *   2. entryFee.underFeeTiers を読み、tierKey → ageCategoryId にマップして
 *      entryFee.ageCategoryFeeTiers に変換、entryFee.pricingMode が "byUnderAge" や
 *      未指定の場合は "byAgeCategory" に書き換える。元の underFeeTiers / pricingMode は削除。
 *   3. requiredQualifications.underQualificationTiers を ageCategoryQualificationTiers に変換。
 *      旧キーは削除。
 *
 * `Event.underBandKeysOverride` / `Event.underAgeEligibilityEnabled` /
 * `CompetitionAgeCategory.underBandKeysEnabled` は本スクリプト実行時点では
 * すでに DROP 済みのことを想定する（drop_under_age_band_fields マイグレーション）。
 * もしまだ DB に存在する場合でも、ここでは触らず Prisma migrate に任せる。
 *
 * Usage:
 *   pnpm tsx scripts/migrate-under-age-to-age-categories.ts --dry-run
 *   pnpm tsx scripts/migrate-under-age-to-age-categories.ts --apply
 *
 * Options:
 *   --dry-run                差分のみ表示し DB は更新しない（既定）
 *   --apply                  DB を更新する
 *   --competitionId=<cuid>   指定大会のみ
 */
import { buildAgeCategoryTemplateRows } from "@/lib/seasonalAgeToBirthDateRange";
import { prisma } from "@/server/db";

type UnderFeeTier = {
  tierKey: string;
  individualEntryFee: number;
  teamEntryFeePerTeam: number;
};

type UnderQualificationTier = {
  tierKey: string;
  requiredQualifications: string[];
};

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

function parseUnderFeeTiers(raw: unknown): UnderFeeTier[] | null {
  const o = readObject(raw);
  if (!o) return null;
  const arr = o.underFeeTiers;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: UnderFeeTier[] = [];
  for (const item of arr) {
    const r = readObject(item);
    if (!r) continue;
    const tierKey = typeof r.tierKey === "string" ? r.tierKey.trim() : "";
    const individualEntryFee =
      typeof r.individualEntryFee === "number" && Number.isFinite(r.individualEntryFee)
        ? r.individualEntryFee
        : 0;
    const teamEntryFeePerTeam =
      typeof r.teamEntryFeePerTeam === "number" && Number.isFinite(r.teamEntryFeePerTeam)
        ? r.teamEntryFeePerTeam
        : 0;
    if (!tierKey) continue;
    out.push({ tierKey, individualEntryFee, teamEntryFeePerTeam });
  }
  return out.length > 0 ? out : null;
}

function parseUnderQualificationTiers(raw: unknown): UnderQualificationTier[] | null {
  const o = readObject(raw);
  if (!o) return null;
  const arr = o.underQualificationTiers;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: UnderQualificationTier[] = [];
  for (const item of arr) {
    const r = readObject(item);
    if (!r) continue;
    const tierKey = typeof r.tierKey === "string" ? r.tierKey.trim() : "";
    if (!tierKey) continue;
    const qualsRaw = r.requiredQualifications;
    if (!Array.isArray(qualsRaw)) continue;
    const requiredQualifications = qualsRaw
      .filter((q): q is string => typeof q === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    out.push({ tierKey, requiredQualifications });
  }
  return out.length > 0 ? out : null;
}

async function ensureAgeCategoriesFromUnderTemplate(
  tx: Awaited<ReturnType<typeof prisma.$transaction>>,
  competition: {
    id: string;
    startDate: Date;
    underAgeUThresholds: number[];
    underAgeOpenEnabled: boolean;
  },
  existingByName: Map<string, { id: string }>,
  dryRun: boolean
): Promise<Map<string, { id: string }>> {
  const rows = buildAgeCategoryTemplateRows(
    competition.startDate,
    competition.underAgeUThresholds,
    competition.underAgeOpenEnabled
  );
  if (rows.length === 0) return existingByName;
  const out = new Map(existingByName);
  let order = 0;
  for (const row of rows) {
    const existing = out.get(row.name);
    if (existing) {
      if (!dryRun) {
        await (tx as typeof prisma).competitionAgeCategory.update({
          where: { id: existing.id },
          data: {
            eligibleBirthDateFrom: row.eligibleBirthDateFrom,
            eligibleBirthDateTo: row.eligibleBirthDateTo,
            displayOrder: order,
          },
        });
      }
    } else {
      if (!dryRun) {
        const created = await (tx as typeof prisma).competitionAgeCategory.create({
          data: {
            competitionId: competition.id,
            name: row.name,
            eligibleBirthDateFrom: row.eligibleBirthDateFrom,
            eligibleBirthDateTo: row.eligibleBirthDateTo,
            displayOrder: order,
          },
          select: { id: true, name: true },
        });
        out.set(created.name, { id: created.id });
      } else {
        out.set(row.name, { id: `__dry_run_${competition.id}_${row.name}__` });
      }
    }
    order += 1;
  }
  return out;
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
      underAgeSystemEnabled: true,
      underAgeUThresholds: true,
      underAgeOpenEnabled: true,
      ageCategories: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, name: true },
      },
    },
    orderBy: { startDate: "asc" },
  });

  let touchedCount = 0;
  for (const c of competitions) {
    const feeTiers = parseUnderFeeTiers(c.entryFee);
    const qualTiers = parseUnderQualificationTiers(c.requiredQualifications);
    if (!feeTiers && !qualTiers && !c.underAgeSystemEnabled) {
      continue;
    }

    console.log(
      `\n[${dryRun ? "dry-run" : "apply"}] competition=${c.id} name="${c.name}" feeTiers=${feeTiers?.length ?? 0} qualTiers=${qualTiers?.length ?? 0} underTemplate=${c.underAgeSystemEnabled}`
    );

    const existingByName = new Map<string, { id: string }>(
      c.ageCategories.map((cat) => [cat.name, { id: cat.id }] as const)
    );

    const performInTx = async (tx: typeof prisma) => {
      const finalByName = c.underAgeSystemEnabled
        ? await ensureAgeCategoriesFromUnderTemplate(
            tx as unknown as Awaited<ReturnType<typeof prisma.$transaction>>,
            {
              id: c.id,
              startDate: new Date(c.startDate),
              underAgeUThresholds: [...(c.underAgeUThresholds ?? [])],
              underAgeOpenEnabled: c.underAgeOpenEnabled ?? true,
            },
            existingByName,
            dryRun
          )
        : existingByName;

      const resolveIdForTierKey = (key: string): string | null => {
        const exact = finalByName.get(key);
        if (exact) return exact.id;
        return null;
      };

      if (feeTiers) {
        const ageCategoryFeeTiers: {
          ageCategoryId: string;
          individualEntryFee: number;
          teamEntryFeePerTeam: number;
        }[] = [];
        const unresolved: string[] = [];
        for (const t of feeTiers) {
          const id = resolveIdForTierKey(t.tierKey);
          if (!id) {
            unresolved.push(t.tierKey);
            continue;
          }
          ageCategoryFeeTiers.push({
            ageCategoryId: id,
            individualEntryFee: t.individualEntryFee,
            teamEntryFeePerTeam: t.teamEntryFeePerTeam,
          });
        }
        if (unresolved.length > 0) {
          console.warn(
            `  [warn] entryFee.underFeeTiers tierKey 解決不可: ${unresolved.join(", ")} （AGEカテゴリ name と一致しない）`
          );
        }
        if (ageCategoryFeeTiers.length > 0) {
          const next = readObject(c.entryFee) ?? {};
          delete next.underFeeTiers;
          if (next.pricingMode === "byUnderAge" || next.pricingMode == null) {
            next.pricingMode = "byAgeCategory";
          }
          next.ageCategoryFeeTiers = ageCategoryFeeTiers;
          console.log(
            `  [fee] tiers=${ageCategoryFeeTiers.length} pricingMode=${String(next.pricingMode)}`
          );
          if (!dryRun) {
            await tx.competition.update({
              where: { id: c.id },
              data: { entryFee: next as object },
            });
          }
        }
      }

      if (qualTiers) {
        const ageCategoryQualificationTiers: {
          ageCategoryId: string;
          requiredQualifications: string[];
        }[] = [];
        const unresolved: string[] = [];
        for (const t of qualTiers) {
          const id = resolveIdForTierKey(t.tierKey);
          if (!id) {
            unresolved.push(t.tierKey);
            continue;
          }
          ageCategoryQualificationTiers.push({
            ageCategoryId: id,
            requiredQualifications: t.requiredQualifications,
          });
        }
        if (unresolved.length > 0) {
          console.warn(
            `  [warn] requiredQualifications.underQualificationTiers tierKey 解決不可: ${unresolved.join(", ")}`
          );
        }
        if (ageCategoryQualificationTiers.length > 0) {
          const next = readObject(c.requiredQualifications) ?? {};
          delete next.underQualificationTiers;
          next.ageCategoryQualificationTiers = ageCategoryQualificationTiers;
          console.log(`  [qual] tiers=${ageCategoryQualificationTiers.length}`);
          if (!dryRun) {
            await tx.competition.update({
              where: { id: c.id },
              data: { requiredQualifications: next as object },
            });
          }
        }
      }
    };

    if (dryRun) {
      // 読み取り専用なのでトランザクションは不要だが、書き込みパスの形を揃える
      await performInTx(prisma);
    } else {
      await prisma.$transaction(async (tx) => {
        await performInTx(tx as unknown as typeof prisma);
      });
    }

    touchedCount += 1;
  }

  console.log(`\nDone. touched=${touchedCount} mode=${dryRun ? "dry-run" : "apply"}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
