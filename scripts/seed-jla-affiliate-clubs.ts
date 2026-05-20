/**
 * JLA加盟クラブ一覧（scripts/data/jla-affiliate-clubs.json）に基づき Club を作成し、
 * 指定メールのユーザーを代表者兼管理者として紐づける。
 *
 * Usage:
 *   pnpm seed:jla-affiliate-clubs
 *   pnpm seed:jla-affiliate-clubs -- --dry-run
 *
 * 接続: DATABASE_URL_UNPOOLED があれば優先（scripts/formalize-organization-by-name.ts と同様）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { normalizeClubRoleForWrite } from "@/lib/roleScopes";
import { datasourceUrlForScripts } from "@/server/db";

const REP_EMAIL = "kaisei.shiga.nslsc@gmail.com";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const a = process.argv.slice(2);
  return { dryRun: a.includes("--dry-run") };
}

async function main(): Promise<number> {
  const { dryRun } = parseArgs();
  const url = datasourceUrlForScripts();
  if (!url) {
    console.error("DATABASE_URL または DATABASE_URL_UNPOOLED を設定してください。");
    return 1;
  }

  const namesPath = join(__dirname, "data", "jla-affiliate-clubs.json");
  const names = JSON.parse(readFileSync(namesPath, "utf8")) as string[];
  if (!Array.isArray(names) || names.length === 0) {
    console.error("クラブ名リストが空です:", namesPath);
    return 1;
  }

  const prisma = new PrismaClient({
    datasourceUrl: url,
    log: ["error", "warn"],
  });

  try {
    await prisma.$connect();

    const user = await prisma.user.findUnique({
      where: { email: REP_EMAIL },
      select: {
        id: true,
        profile: {
          select: {
            familyName: true,
            givenName: true,
            familyNameKana: true,
            givenNameKana: true,
          },
        },
        address: {
          select: {
            postalCode: true,
            prefecture: true,
            city: true,
            addressLine1: true,
            addressLine2: true,
          },
        },
        contact: {
          select: {
            phoneNumber: true,
          },
        },
      },
    });

    if (!user) {
      console.error(`代表者ユーザーが見つかりません: ${REP_EMAIL}`);
      return 1;
    }

    if (dryRun) {
      console.log("[dry-run] DB への書き込みは行いません。");
      console.log({ clubCount: names.length, representativeEmail: REP_EMAIL });
      return 0;
    }

    const repData = {
      representativeUserId: user.id,
      representativeFamilyName: user.profile?.familyName ?? null,
      representativeGivenName: user.profile?.givenName ?? null,
      representativeFamilyNameKana: user.profile?.familyNameKana ?? null,
      representativeGivenNameKana: user.profile?.givenNameKana ?? null,
      representativePostalCode: user.address?.postalCode ?? null,
      representativePrefecture: user.address?.prefecture ?? null,
      representativeCity: user.address?.city ?? null,
      representativeAddressLine1: user.address?.addressLine1 ?? null,
      representativeAddressLine2: user.address?.addressLine2 ?? null,
      representativePhone: user.contact?.phoneNumber ?? null,
    };

    let created = 0;
    let updated = 0;
    let membershipsUpserted = 0;

    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;

      const existing = await prisma.club.findFirst({
        where: { name: trimmed },
        select: { id: true },
      });

      let clubId: string;

      if (existing) {
        await prisma.club.update({
          where: { id: existing.id },
          data: {
            ...repData,
            creatorId: user.id,
            status: "APPROVED",
            isLifesavingClub: true,
          },
        });
        clubId = existing.id;
        updated += 1;
      } else {
        const club = await prisma.club.create({
          data: {
            name: trimmed,
            ...repData,
            creatorId: user.id,
            status: "APPROVED",
            isLifesavingClub: true,
          },
        });
        clubId = club.id;
        created += 1;
      }

      await prisma.membership.upsert({
        where: {
          userId_clubId: { userId: user.id, clubId },
        },
        create: {
          userId: user.id,
          clubId,
          role: normalizeClubRoleForWrite("ADMIN"),
          status: "APPROVED",
        },
        update: {
          role: normalizeClubRoleForWrite("ADMIN"),
          status: "APPROVED",
        },
      });
      membershipsUpserted += 1;
    }

    console.log("完了:");
    console.log(`  新規クラブ: ${created}`);
    console.log(`  既存クラブ（代表・ステータス更新）: ${updated}`);
    console.log(`  メンバーシップ（ADMIN 確定）: ${membershipsUpserted}`);
    console.log(`  代表者: ${REP_EMAIL} (${user.id})`);
    return 0;
  } catch (e) {
    console.error(e);
    return 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
