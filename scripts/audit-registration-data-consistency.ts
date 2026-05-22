/**
 * 新規登録・ユーザー一意性・認証フラグの既存データ整合性を監査する（読み取り専用）。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/audit-registration-data-consistency.ts
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/audit-registration-data-consistency.ts
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";
import { normalizeKana } from "@/lib/normalize-kana";

const TEMP_EMAIL_SUFFIX = "@temp.jla.local";
const SAMPLE_LIMIT = 15;

type Issue = {
  code: string;
  severity: "error" | "warn" | "info";
  count: number;
  samples: string[];
};

function sampleIds(ids: string[], limit = SAMPLE_LIMIT): string[] {
  return ids.slice(0, limit);
}

async function main() {
  const issues: Issue[] = [];
  const now = new Date();

  const [
    userCount,
    profileCount,
    contactCount,
    securityCount,
    sessionCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userProfile.count(),
    prisma.userContact.count(),
    prisma.userSecurity.count(),
    prisma.registrationSession.count(),
  ]);

  console.log("=== 登録・認証データ整合性監査 ===");
  console.log(`Users: ${userCount}, Profiles: ${profileCount}, Contacts: ${contactCount}, Security: ${securityCount}`);
  console.log(`RegistrationSessions (active in DB): ${sessionCount}`);
  console.log("");

  // --- 1. 正規化カナと DB 保存値の不一致 ---
  const profiles = await prisma.userProfile.findMany({
    select: {
      userId: true,
      familyNameKana: true,
      givenNameKana: true,
      normalizedFamilyName: true,
      normalizedGivenName: true,
      user: { select: { email: true } },
    },
  });

  const kanaMismatchIds: string[] = [];
  const mismatchBreakdown = {
    storedHiragana: 0,
    storedHasSpace: 0,
    storedLatin: 0,
    other: 0,
  };
  for (const p of profiles) {
    if (p.user.email.endsWith("@seed.local")) continue;

    const expFamily = normalizeKana(p.familyNameKana);
    const expGiven = normalizeKana(p.givenNameKana);
    if (
      p.normalizedFamilyName !== expFamily ||
      p.normalizedGivenName !== expGiven
    ) {
      kanaMismatchIds.push(p.userId);
      const stored = `${p.normalizedFamilyName}${p.normalizedGivenName}`;
      if (/[\u3041-\u3096]/.test(stored)) mismatchBreakdown.storedHiragana += 1;
      else if (/\s/.test(p.normalizedFamilyName) || /\s/.test(p.normalizedGivenName))
        mismatchBreakdown.storedHasSpace += 1;
      else if (/^[A-Za-z0-9\s]+$/.test(p.normalizedFamilyName + p.normalizedGivenName))
        mismatchBreakdown.storedLatin += 1;
      else mismatchBreakdown.other += 1;
    }
  }
  if (kanaMismatchIds.length > 0) {
    issues.push({
      code: "NORMALIZED_KANA_MISMATCH",
      severity: "error",
      count: kanaMismatchIds.length,
      samples: sampleIds(kanaMismatchIds),
    });
  }

  // --- 2. 正規化前カナが同じ・生年月日同じだが正規化後は別（重複検知すり抜け候補）---
  const profilesWithDob = await prisma.userProfile.findMany({
    select: {
      userId: true,
      familyNameKana: true,
      givenNameKana: true,
      normalizedFamilyName: true,
      normalizedGivenName: true,
      dateOfBirth: true,
    },
  });

  type RawKey = string;
  const rawGroups = new Map<RawKey, string[]>();
  for (const p of profilesWithDob) {
    const rawKey = [
      p.familyNameKana.trim(),
      p.givenNameKana.trim(),
      p.dateOfBirth.toISOString().slice(0, 10),
    ].join("\t");
    const arr = rawGroups.get(rawKey) ?? [];
    arr.push(p.userId);
    rawGroups.set(rawKey, arr);
  }

  const rawDupUserIds: string[] = [];
  for (const [, ids] of rawGroups) {
    if (ids.length > 1) rawDupUserIds.push(...ids);
  }
  if (rawDupUserIds.length > 0) {
    issues.push({
      code: "RAW_KANA_DOB_DUPLICATE_USERS",
      severity: "warn",
      count: rawDupUserIds.length,
      samples: sampleIds([...new Set(rawDupUserIds)]),
    });
  }

  // --- 3. DB ユニーク制約違反（正規化氏名+生年月日）---
  const normDup = await prisma.$queryRaw<
    { normalizedFamilyName: string; normalizedGivenName: string; dateOfBirth: Date; cnt: bigint }[]
  >`
    SELECT "normalizedFamilyName", "normalizedGivenName", "dateOfBirth", COUNT(*)::bigint AS cnt
    FROM "UserProfile"
    GROUP BY "normalizedFamilyName", "normalizedGivenName", "dateOfBirth"
    HAVING COUNT(*) > 1
  `;
  if (normDup.length > 0) {
    issues.push({
      code: "NORMALIZED_NAME_DOB_DB_DUPLICATE",
      severity: "error",
      count: normDup.length,
      samples: normDup.slice(0, SAMPLE_LIMIT).map(
        (r) =>
          `${r.normalizedFamilyName}/${r.normalizedGivenName}/${r.dateOfBirth.toISOString().slice(0, 10)} x${r.cnt}`
      ),
    });
  }

  // --- 4. phoneVerified / phoneVerifiedAt の不整合 ---
  const contacts = await prisma.userContact.findMany({
    select: { userId: true, phoneVerified: true, phoneVerifiedAt: true },
  });
  const phoneFlagMismatch: string[] = [];
  for (const c of contacts) {
    if (c.phoneVerified && !c.phoneVerifiedAt) {
      phoneFlagMismatch.push(`${c.userId}: verified=true, verifiedAt=null`);
    }
    if (!c.phoneVerified && c.phoneVerifiedAt) {
      phoneFlagMismatch.push(`${c.userId}: verified=false, verifiedAt=set`);
    }
  }
  if (phoneFlagMismatch.length > 0) {
    issues.push({
      code: "PHONE_VERIFIED_FLAG_MISMATCH",
      severity: "warn",
      count: phoneFlagMismatch.length,
      samples: phoneFlagMismatch.slice(0, SAMPLE_LIMIT),
    });
  }

  // --- 5. 実メール vs temp メール と認証フラグ ---
  const usersWithFlags = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      security: { select: { emailVerified: true } },
      contact: { select: { phoneVerified: true } },
    },
  });

  const tempEmailIds: string[] = [];
  const realEmailUnverified: string[] = [];
  const realEmailNoPhone: string[] = [];
  const tempEmailVerified: string[] = [];
  const nonLowercaseEmail: string[] = [];

  for (const u of usersWithFlags) {
    const isTemp = u.email.endsWith(TEMP_EMAIL_SUFFIX);
    const emailVerified = u.security?.emailVerified ?? false;
    const phoneVerified = u.contact?.phoneVerified ?? false;

    if (u.email !== u.email.toLowerCase()) {
      nonLowercaseEmail.push(u.id);
    }

    if (isTemp) {
      tempEmailIds.push(u.id);
      if (emailVerified) tempEmailVerified.push(u.id);
    } else {
      if (!emailVerified) realEmailUnverified.push(u.id);
      if (!phoneVerified) realEmailNoPhone.push(u.id);
    }
  }

  if (nonLowercaseEmail.length > 0) {
    issues.push({
      code: "EMAIL_NOT_LOWERCASE",
      severity: "warn",
      count: nonLowercaseEmail.length,
      samples: sampleIds(nonLowercaseEmail),
    });
  }

  if (realEmailUnverified.length > 0) {
    issues.push({
      code: "REAL_EMAIL_BUT_EMAIL_UNVERIFIED",
      severity: "info",
      count: realEmailUnverified.length,
      samples: sampleIds(realEmailUnverified),
    });
  }

  if (tempEmailVerified.length > 0) {
    issues.push({
      code: "TEMP_EMAIL_BUT_EMAIL_VERIFIED",
      severity: "warn",
      count: tempEmailVerified.length,
      samples: sampleIds(tempEmailVerified),
    });
  }

  // --- 6. 必須リレーション欠落 ---
  const usersMissingParts = await prisma.user.findMany({
    where: {
      OR: [
        { profile: null },
        { contact: null },
        { security: null },
        { address: null },
      ],
    },
    select: {
      id: true,
      profile: { select: { userId: true } },
      contact: { select: { userId: true } },
      security: { select: { userId: true } },
      address: { select: { userId: true } },
    },
  });
  if (usersMissingParts.length > 0) {
    issues.push({
      code: "USER_MISSING_RELATED_RECORD",
      severity: "error",
      count: usersMissingParts.length,
      samples: usersMissingParts.map((u) => {
        const missing = [
          !u.profile && "profile",
          !u.contact && "contact",
          !u.security && "security",
          !u.address && "address",
        ].filter(Boolean);
        return `${u.id}: ${missing.join(",")}`;
      }),
    });
  }

  // --- 7. 期限切れ registrationSession が残存 ---
  const expiredSessions = await prisma.registrationSession.count({
    where: { expiresAt: { lt: now } },
  });
  if (expiredSessions > 0) {
    const samples = await prisma.registrationSession.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, expiresAt: true, registrationOtpDelivery: true },
      take: SAMPLE_LIMIT,
      orderBy: { expiresAt: "asc" },
    });
    issues.push({
      code: "EXPIRED_REGISTRATION_SESSION_REMAINS",
      severity: "info",
      count: expiredSessions,
      samples: samples.map(
        (s) =>
          `${s.id} expired=${s.expiresAt.toISOString()} delivery=${s.registrationOtpDelivery ?? "null"}`
      ),
    });
  }

  // --- 8. registrationOtpDelivery 未設定のセッション ---
  const nullDeliverySessions = await prisma.registrationSession.count({
    where: { registrationOtpDelivery: null },
  });
  if (nullDeliverySessions > 0) {
    const samples = await prisma.registrationSession.findMany({
      where: { registrationOtpDelivery: null },
      select: { id: true, createdAt: true },
      take: SAMPLE_LIMIT,
      orderBy: { createdAt: "desc" },
    });
    issues.push({
      code: "REGISTRATION_SESSION_NULL_OTP_DELIVERY",
      severity: "info",
      count: nullDeliverySessions,
      samples: samples.map((s) => `${s.id} created=${s.createdAt.toISOString()}`),
    });
  }

  // --- 9. メール重複（User.email unique 前提）---
  const emailDup = await prisma.$queryRaw<{ email: string; cnt: bigint }[]>`
    SELECT email, COUNT(*)::bigint AS cnt FROM "User" GROUP BY email HAVING COUNT(*) > 1
  `;
  if (emailDup.length > 0) {
    issues.push({
      code: "DUPLICATE_USER_EMAIL",
      severity: "error",
      count: emailDup.length,
      samples: emailDup.map((r) => `${r.email} x${r.cnt}`),
    });
  }

  // --- サマリー ---
  console.log("--- 集計（参考） ---");
  if (kanaMismatchIds.length > 0) {
    console.log("正規化カナ不一致の内訳:", mismatchBreakdown);
  }
  console.log(`仮メール (${TEMP_EMAIL_SUFFIX}): ${tempEmailIds.length}`);
  console.log(`実メール & emailVerified=false: ${realEmailUnverified.length}`);
  console.log(`実メール & phoneVerified=false: ${realEmailNoPhone.length}`);
  console.log("");

  if (issues.length === 0) {
    console.log("✅ 検出された不整合はありません。");
    return;
  }

  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  console.log("--- 検出項目 ---");
  for (const i of issues) {
    const icon =
      i.severity === "error" ? "❌" : i.severity === "warn" ? "⚠️" : "ℹ️";
    console.log(`${icon} [${i.code}] ${i.severity} — ${i.count} 件`);
    for (const s of i.samples) {
      console.log(`    · ${s}`);
    }
    if (i.count > i.samples.length) {
      console.log(`    … 他 ${i.count - i.samples.length} 件`);
    }
    console.log("");
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  process.exitCode = errors > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
