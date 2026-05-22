/**
 * 2ユーザーの関連データ件数を比較（重複統合の判断用）。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/compare-user-data-footprint.ts <userIdA> <userIdB>
 */
import "./loadScriptEnv";
import { prisma } from "@/server/db";

async function countFor(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      profile: true,
      contact: true,
      security: true,
      address: true,
      emergencyContact: true,
      jlaProfile: true,
      nfcTag: true,
      passkeyCredentials: { select: { id: true } },
    },
  });
  if (!u) return null;

  const [
    loginEvents,
    competitionEntries,
    teamEntryMembers,
    memberships,
    orgAdmins,
    officialApplications,
    officialAttendances,
    dayCheckins,
    payments,
    qualifications,
    passkeyChallenges,
    loginSessions,
    notifications,
    entryCheckoutSessions,
  ] = await Promise.all([
    prisma.userLoginEvent.count({ where: { userId } }),
    prisma.competitionEntry.count({ where: { userId } }),
    prisma.teamEntryMember.count({ where: { userId } }),
    prisma.membership.count({ where: { userId } }),
    prisma.orgAdmin.count({ where: { userId } }),
    prisma.competitionOfficialApplication.count({ where: { userId } }),
    prisma.competitionOfficialAttendance.count({ where: { userId } }),
    prisma.competitionDayCheckin.count({ where: { userId } }),
    prisma.payment.count({ where: { userId } }),
    prisma.qualification.count({ where: { userId } }),
    prisma.passkeyChallenge.count({ where: { userId } }),
    prisma.loginSession.count({ where: { userId } }),
    prisma.notification.count({ where: { userId } }),
    prisma.entryCheckoutSession.count({ where: { userId } }),
  ]);

  const counts = {
    loginEvents,
    competitionEntries,
    teamEntryMembers,
    memberships,
    orgAdmins,
    officialApplications,
    officialAttendances,
    dayCheckins,
    payments,
    qualifications,
    passkeyChallenges,
    loginSessions,
    notifications,
    entryCheckoutSessions,
    passkeys: u.passkeyCredentials.length,
  };
  const total =
    Object.values(counts).reduce((a, b) => a + b, 0) +
    (u.profile ? 1 : 0) +
    (u.contact ? 1 : 0) +
    (u.security ? 1 : 0);

  return { user: u, counts, total };
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error("Usage: compare-user-data-footprint.ts <userIdA> <userIdB>");
    process.exit(1);
  }

  const [ra, rb] = await Promise.all([countFor(a), countFor(b)]);
  for (const r of [ra, rb]) {
    if (!r) {
      console.log("not found");
      continue;
    }
    console.log("\n===", r.user.id, "===");
    console.log("email:", r.user.email);
    console.log("created:", r.user.createdAt.toISOString());
    console.log("profile kana:", r.user.profile?.familyNameKana, r.user.profile?.givenNameKana);
    console.log("normalized:", r.user.profile?.normalizedFamilyName, r.user.profile?.normalizedGivenName);
    console.log("counts:", r.counts);
    console.log("total score:", r.total);
  }

  if (ra && rb) {
    const keep = ra.total >= rb.total ? ra : rb;
    const drop = ra.total >= rb.total ? rb : ra;
    console.log("\n>>> 情報量多い方（推奨 keep）:", keep.user.id, keep.user.email, "score=", keep.total);
    console.log(">>> merge 元（drop）:", drop.user.id, drop.user.email, "score=", drop.total);
  }
}

main().finally(() => prisma.$disconnect());
