import type { PrismaClient } from "@prisma/client";
import type { StartListRoundData } from "@/lib/startListRounds";

function formatProfileName(profile: {
  familyName: string | null;
  givenName: string | null;
}): string {
  return `${profile.familyName ?? ""} ${profile.givenName ?? ""}`.trim();
}

function normalizeMemberNameForMatch(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

/** スナップショット各ラウンドを走査し、teamEntryId ごとに最後に見つかった非空 members[] を返す */
export function collectSnapshotTeamMembersByTeamEntryId(
  frozenSnapshotRounds: ReadonlyArray<StartListRoundData>
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const round of frozenSnapshotRounds) {
    for (const heat of round.heats ?? []) {
      for (const p of heat.participants) {
        if (p.kind !== "TEAM" || !p.teamEntryId) continue;
        const members = (p.members ?? []).map((m) => m.trim()).filter(Boolean);
        if (members.length > 0) {
          out.set(p.teamEntryId, members);
        }
      }
    }
  }
  return out;
}

async function resolveMemberRowsFromSnapshotNames(
  prisma: Pick<PrismaClient, "competitionEntry">,
  params: {
    competitionId: string;
    clubId: string;
    teamEntryId: string;
    memberNames: readonly string[];
  }
): Promise<Array<{ teamEntryId: string; userId: string; role: string; order: number }>> {
  const { competitionId, clubId, teamEntryId, memberNames } = params;
  if (memberNames.length === 0) return [];

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      clubId,
      status: "SUBMITTED",
    },
    select: {
      userId: true,
      user: {
        select: {
          profile: {
            select: { familyName: true, givenName: true },
          },
        },
      },
    },
  });

  const byNormalizedName = new Map<string, string>();
  for (const entry of entries) {
    const profile = entry.user.profile;
    if (!profile) continue;
    const spaced = formatProfileName(profile);
    const compact = normalizeMemberNameForMatch(spaced);
    if (spaced) byNormalizedName.set(spaced, entry.userId);
    if (compact) byNormalizedName.set(compact, entry.userId);
  }

  const rows: Array<{ teamEntryId: string; userId: string; role: string; order: number }> = [];
  const usedUserIds = new Set<string>();
  for (let i = 0; i < memberNames.length; i++) {
    const raw = memberNames[i]!.trim();
    if (!raw) continue;
    const userId =
      byNormalizedName.get(raw) ?? byNormalizedName.get(normalizeMemberNameForMatch(raw));
    if (!userId || usedUserIds.has(userId)) continue;
    usedUserIds.add(userId);
    rows.push({
      teamEntryId,
      userId,
      role: "ATHLETE",
      order: i + 1,
    });
  }
  return rows;
}

/**
 * DB に TeamEntryMember が無いチームへ、スナップショット JSON の members[] から割当を復元する。
 * 既存大会でキャプチャ時点の名前だけスナップショットに残っているケース向け（冪等）。
 */
export async function backfillTeamEntryMembersFromSnapshotIfEmpty(
  prisma: Pick<PrismaClient, "teamEntry" | "teamEntryMember" | "competitionEntry">,
  params: {
    competitionId: string;
    eventId: string;
    frozenSnapshotRounds: ReadonlyArray<StartListRoundData> | null | undefined;
  }
): Promise<number> {
  const { competitionId, eventId, frozenSnapshotRounds } = params;
  if (!frozenSnapshotRounds?.length) return 0;

  const snapshotMembersByTeamId = collectSnapshotTeamMembersByTeamEntryId(frozenSnapshotRounds);
  if (snapshotMembersByTeamId.size === 0) return 0;

  const teamEntries = await prisma.teamEntry.findMany({
    where: { competitionId, eventId },
    select: {
      id: true,
      clubId: true,
      members: { select: { id: true }, take: 1 },
    },
  });

  let created = 0;
  for (const teamEntry of teamEntries) {
    if (teamEntry.members.length > 0) continue;
    const memberNames = snapshotMembersByTeamId.get(teamEntry.id);
    if (!memberNames?.length) continue;

    const rows = await resolveMemberRowsFromSnapshotNames(prisma, {
      competitionId,
      clubId: teamEntry.clubId,
      teamEntryId: teamEntry.id,
      memberNames,
    });
    if (rows.length === 0) continue;

    await prisma.teamEntryMember.createMany({ data: rows, skipDuplicates: true });
    created += rows.length;
  }
  return created;
}
