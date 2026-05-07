/**
 * クラブページで TO / 個人エントリーが期待どおり出ないときの診断用。
 * DB に接続し、プラン記載の観点（clubId NULL、大会フラグ、TO 行、公式応募）をまとめて表示する。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/diagnose-club-to-reflection.ts --clubId=<cuid> [--competitionId=<cuid>]
 */
import { parseTechnicalOfficialTiers } from "@/lib/technicalOfficialRules";
import { extractClubIdFromEntrySnapshotData } from "@/lib/entrySnapshotClubId";
import {
  competitionIdsForClubFromApprovedTechnicalOfficialApplications,
  loadCompetitionForTechnicalOfficialApplicationResolve,
  resolveClubIdForTechnicalOfficialApplicationWithDiagnostic,
  extractTechnicalOfficialClubDisplayNameFromPosition,
} from "@/lib/resolveTechnicalOfficialApplicationClub";
import { countValidTechnicalOfficialAssignmentsDetailed } from "@/lib/technicalOfficialQueries";
import { prisma } from "@/server/db";

function parseArgs() {
  let clubId = "";
  let competitionId: string | null = null;
  for (const a of process.argv.slice(2)) {
    if (a === "--") continue;
    if (a.startsWith("--clubId=")) clubId = a.slice("--clubId=".length).trim();
    else if (a.startsWith("--competitionId="))
      competitionId = a.slice("--competitionId=".length).trim() || null;
  }
  return { clubId, competitionId };
}

async function main() {
  const { clubId, competitionId } = parseArgs();
  if (!clubId) {
    console.error("Usage: ... diagnose-club-to-reflection.ts --clubId=<id> [--competitionId=<id>]");
    process.exit(1);
  }

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, name: true },
  });
  if (!club) {
    console.error(`Club not found: ${clubId}`);
    process.exit(1);
  }

  console.log(`Club: ${club.name} (${club.id})\n`);

  const memberUserIds = (
    await prisma.membership.findMany({
      where: { clubId, status: "APPROVED" },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const [teamCompIds, indWithClub, indNullClubMembers, toAssign, toInv, officialApps] =
    await Promise.all([
      prisma.teamEntry.findMany({
        where: { clubId, ...(competitionId ? { competitionId } : {}) },
        select: { competitionId: true },
        distinct: ["competitionId"],
      }),
      prisma.competitionEntry.findMany({
        where: {
          clubId,
          status: { not: "CANCELLED" },
          ...(competitionId ? { competitionId } : {}),
        },
        select: { id: true, competitionId: true, userId: true, clubId: true },
      }),
      memberUserIds.length === 0
        ? []
        : prisma.competitionEntry.findMany({
            where: {
              clubId: null,
              userId: { in: memberUserIds },
              status: { not: "CANCELLED" },
              ...(competitionId ? { competitionId } : {}),
            },
            select: {
              id: true,
              competitionId: true,
              userId: true,
              snapshot: { select: { data: true } },
            },
          }),
      prisma.competitionTechnicalOfficialAssignment.findMany({
        where: { clubId, ...(competitionId ? { competitionId } : {}) },
        select: { competitionId: true },
        distinct: ["competitionId"],
      }),
      prisma.competitionTechnicalOfficialInvitation.findMany({
        where: { clubId, status: "PENDING", ...(competitionId ? { competitionId } : {}) },
        select: { competitionId: true },
        distinct: ["competitionId"],
      }),
      competitionId
        ? prisma.competitionOfficialApplication.findMany({
            where: { competitionId },
            select: {
              id: true,
              competitionId: true,
              userId: true,
              positionName: true,
              status: true,
            },
          })
        : prisma.competitionOfficialApplication.findMany({
            where: {
              positionName: { startsWith: "テクニカルオフィシャル（" },
              status: "APPROVED",
            },
            select: { id: true, competitionId: true, userId: true, positionName: true },
            take: 50,
            orderBy: { id: "desc" },
          }),
    ]);

  console.log("--- 集計（クラブページの土台） ---");
  console.log(`TeamEntry がある大会数: ${teamCompIds.length}`);
  console.log(`CompetitionEntry.clubId = 当クラブ（キャンセル除く）: ${indWithClub.length} 行`);
  console.log(
    `承認メンバーの CompetitionEntry だが clubId IS NULL（クラブページの個人/TO件数から漏れやすい）: ${indNullClubMembers.length} 行`
  );
  console.log(`TO 任命のある大会数: ${toAssign.length}`);
  console.log(`TO 保留招待のある大会数: ${toInv.length}\n`);

  let snapshotPointsHere = 0;
  let snapshotPointsElsewhere = 0;
  let snapshotMissingClubId = 0;
  for (const e of indNullClubMembers) {
    const snapClub = extractClubIdFromEntrySnapshotData(e.snapshot?.data);
    if (!snapClub) snapshotMissingClubId += 1;
    else if (snapClub === clubId) snapshotPointsHere += 1;
    else snapshotPointsElsewhere += 1;
  }
  console.log("--- clubId NULL 行のスナップショット内 clubId ---");
  console.log(`スナップショットが当クラブ ID と一致（バックフィル候補）: ${snapshotPointsHere}`);
  console.log(`スナップショットが別クラブ ID: ${snapshotPointsElsewhere}`);
  console.log(`スナップショットに clubId なし: ${snapshotMissingClubId}\n`);

  if (indNullClubMembers.length > 0 && snapshotPointsHere > 0) {
    console.log(
      "ヒント: scripts/backfill-competition-entry-club-id-from-snapshot.ts で当クラブへ clubId を復元できる可能性があります。\n"
    );
  }

  const relatedCompIds = new Set<string>();
  for (const r of teamCompIds) relatedCompIds.add(r.competitionId);
  for (const e of indWithClub) relatedCompIds.add(e.competitionId);
  for (const e of indNullClubMembers) relatedCompIds.add(e.competitionId);
  for (const r of toAssign) relatedCompIds.add(r.competitionId);
  for (const r of toInv) relatedCompIds.add(r.competitionId);
  if (competitionId) relatedCompIds.add(competitionId);

  const compList =
    relatedCompIds.size > 0
      ? await prisma.competition.findMany({
          where: { id: { in: [...relatedCompIds] } },
          select: {
            id: true,
            name: true,
            officialRecruitmentEnabled: true,
            technicalOfficialRecruitmentEnabled: true,
            technicalOfficialTiers: true,
          },
        })
      : competitionId
        ? await prisma.competition.findMany({
            where: { id: competitionId },
            select: {
              id: true,
              name: true,
              officialRecruitmentEnabled: true,
              technicalOfficialRecruitmentEnabled: true,
              technicalOfficialTiers: true,
            },
          })
        : [];

  console.log("--- 関連大会の TO 表示条件 ---");
  for (const c of compList.sort((a, b) => a.name.localeCompare(b.name, "ja"))) {
    const tiers = parseTechnicalOfficialTiers(c.technicalOfficialTiers);
    const showToBlock =
      c.officialRecruitmentEnabled && c.technicalOfficialRecruitmentEnabled;
    console.log(
      `- ${c.name} (${c.id})\n` +
        `    officialRecruitmentEnabled=${c.officialRecruitmentEnabled} technicalOfficialRecruitmentEnabled=${c.technicalOfficialRecruitmentEnabled}\n` +
        `    TOブロック表示(showTo前提)=${showToBlock} tiers行数=${tiers.length}`
    );
  }

  if (officialApps.length > 0) {
    console.log("\n--- 公式応募（抜粋） ---");
    for (const a of officialApps.slice(0, 20)) {
      const line = "competitionId" in a ? `${a.competitionId} ` : "";
      console.log(
        `${line}user=${a.userId} status=${"status" in a ? a.status : "?"} position="${a.positionName}"`
      );
    }
    if (!competitionId && officialApps.length === 50) {
      console.log("(他にもあります。--competitionId で絞るか DB を直接参照してください)");
    }
    console.log(
      "\nヒント: TO 任命が無い場合は pnpm run backfill:to-assignment-from-official-apps:dry を確認してください。"
    );
  }

  const idsFromToApps = await competitionIdsForClubFromApprovedTechnicalOfficialApplications(
    prisma,
    club.id,
    club.name
  );
  console.log("\n--- TO 公式応募から解決した大会 ID（クラブページにマージされる） ---");
  console.log(`件数: ${idsFromToApps.length}`);
  if (idsFromToApps.length > 0) {
    console.log(idsFromToApps.join(", "));
  }

  const toAppsForClub = await prisma.competitionOfficialApplication.findMany({
    where: {
      status: "APPROVED",
      positionName: {
        startsWith: `テクニカルオフィシャル（${club.name.trim()}`,
      },
      ...(competitionId ? { competitionId } : {}),
    },
    select: { id: true, competitionId: true, userId: true, positionName: true },
  });
  const compCache = new Map<
    string,
    Awaited<ReturnType<typeof loadCompetitionForTechnicalOfficialApplicationResolve>>
  >();
  const missingAssignment: { applicationId: string; competitionId: string; userId: string }[] = [];
  for (const app of toAppsForClub) {
    const dn = extractTechnicalOfficialClubDisplayNameFromPosition(app.positionName);
    if (dn !== club.name.trim()) continue;
    let c = compCache.get(app.competitionId);
    if (c === undefined) {
      c = await loadCompetitionForTechnicalOfficialApplicationResolve(prisma, app.competitionId);
      compCache.set(app.competitionId, c);
    }
    if (!c?.technicalOfficialRecruitmentEnabled) continue;
    const resolved = await resolveClubIdForTechnicalOfficialApplicationWithDiagnostic(prisma, {
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
      competition: c,
    });
    if (resolved.clubId !== club.id) continue;
    const row = await prisma.competitionTechnicalOfficialAssignment.findUnique({
      where: {
        competitionId_clubId_userId: {
          competitionId: app.competitionId,
          clubId: club.id,
          userId: app.userId,
        },
      },
      select: { id: true },
    });
    if (!row) {
      missingAssignment.push({
        applicationId: app.id,
        competitionId: app.competitionId,
        userId: app.userId,
      });
    }
  }
  console.log("\n--- 当クラブ向け TO 応募で CompetitionTechnicalOfficialAssignment が無い行 ---");
  console.log(`件数: ${missingAssignment.length}`);
  for (const m of missingAssignment.slice(0, 30)) {
    console.log(
      `  application=${m.applicationId} competition=${m.competitionId} user=${m.userId}`
    );
  }
  if (missingAssignment.length > 30) {
    console.log(`  ... 他 ${missingAssignment.length - 30} 件`);
  }
  if (missingAssignment.length > 0) {
    console.log(
      "\nヒント: pnpm run backfill:to-assignment-from-official-apps:dry で一括作成できる場合があります。"
    );
  }

  const diagnoseCompetitionIds = competitionId
    ? [competitionId]
    : [...new Set([...idsFromToApps, ...toAssign.map((x) => x.competitionId)])];
  if (diagnoseCompetitionIds.length > 0) {
    console.log("\n--- 充足集計の診断内訳（クラブ別） ---");
    for (const cid of diagnoseCompetitionIds.slice(0, 20)) {
      const comp = await prisma.competition.findUnique({
        where: { id: cid },
        select: { officialQualificationFilterEnabled: true, name: true },
      });
      if (!comp) continue;
      const detail = await countValidTechnicalOfficialAssignmentsDetailed(
        prisma,
        cid,
        club.id,
        Boolean(comp.officialQualificationFilterEnabled)
      );
      console.log(
        `- ${comp.name} (${cid}): assigned=${detail.assigned} assignment=${detail.diagnostics.assignmentCount} fallback=${detail.diagnostics.fallbackApprovedCount} unresolved=${detail.diagnostics.unresolvedApprovedCount}`
      );
    }
  }

  const unresolvedReasonCount = new Map<string, number>();
  for (const app of toAppsForClub) {
    const dn = extractTechnicalOfficialClubDisplayNameFromPosition(app.positionName);
    if (dn !== club.name.trim()) continue;
    let c = compCache.get(app.competitionId);
    if (c === undefined) {
      c = await loadCompetitionForTechnicalOfficialApplicationResolve(prisma, app.competitionId);
      compCache.set(app.competitionId, c);
    }
    if (!c?.technicalOfficialRecruitmentEnabled) continue;
    const resolved = await resolveClubIdForTechnicalOfficialApplicationWithDiagnostic(prisma, {
      competitionId: app.competitionId,
      userId: app.userId,
      positionName: app.positionName,
      competition: c,
    });
    if (!resolved.clubId) {
      unresolvedReasonCount.set(
        resolved.reason,
        (unresolvedReasonCount.get(resolved.reason) ?? 0) + 1
      );
    }
  }
  if (unresolvedReasonCount.size > 0) {
    console.log("\n--- TO応募のクラブ解決失敗理由 ---");
    for (const [reason, count] of [...unresolvedReasonCount.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  console.log("\n診断完了。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
