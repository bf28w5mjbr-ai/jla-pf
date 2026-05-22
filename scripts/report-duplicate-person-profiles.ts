/**
 * 正規化後に同一人物（氏名カナ+生年月日）とみなされるユーザーをレポートする。
 *
 * Usage:
 *   pnpm report:duplicate-person-profiles
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";
import { normalizeKana } from "@/lib/normalize-kana";

async function main() {
  const profiles = await prisma.userProfile.findMany({
    select: {
      userId: true,
      familyNameKana: true,
      givenNameKana: true,
      dateOfBirth: true,
      user: { select: { email: true, createdAt: true } },
    },
  });

  const groups = new Map<
    string,
    {
      userId: string;
      email: string;
      createdAt: Date;
      kana: string;
      storedNorm: string;
      computedNorm: string;
    }[]
  >();

  for (const p of profiles) {
    const computedNorm = `${normalizeKana(p.familyNameKana)}/${normalizeKana(p.givenNameKana)}`;
    const key = `${computedNorm}\t${p.dateOfBirth.toISOString().slice(0, 10)}`;
    const arr = groups.get(key) ?? [];
    arr.push({
      userId: p.userId,
      email: p.user.email,
      createdAt: p.user.createdAt,
      kana: `${p.familyNameKana} ${p.givenNameKana}`,
      storedNorm: "(stored in DB — run audit for detail)",
      computedNorm,
    });
    groups.set(key, arr);
  }

  const dups = [...groups.entries()].filter(([, v]) => v.length > 1);

  console.log(`=== 正規化ベースの重複候補: ${dups.length} グループ ===\n`);
  for (const [key, members] of dups) {
    console.log(key);
    for (const m of members.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )) {
      console.log(
        `  ${m.userId} | ${m.email} | created=${m.createdAt.toISOString()} | kana=${m.kana}`
      );
    }
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
