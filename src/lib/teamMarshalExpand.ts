import type { PrismaClient } from "@prisma/client";
import type { MarshalParticipantRef } from "@/lib/heatMarshalFromSnapshot";
import { filterAssignableTeamEntryMembers } from "@/lib/teamMemberSlots";

type TeamMemberScopedDb = Pick<PrismaClient, "teamEntryMember">;

export async function fetchTeamMembersMapForTeamIds(
  db: TeamMemberScopedDb,
  teamIds: string[]
): Promise<Map<string, Array<{ userId: string; label: string }>>> {
  const map = new Map<string, Array<{ userId: string; label: string }>>();
  if (teamIds.length === 0) return map;
  const memberRows = await db.teamEntryMember.findMany({
    where: { teamEntryId: { in: teamIds } },
    orderBy: { order: "asc" },
    select: {
      teamEntryId: true,
      userId: true,
      role: true,
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
    },
  });
  for (const m of filterAssignableTeamEntryMembers(memberRows)) {
    const list = map.get(m.teamEntryId) ?? [];
    list.push({
      userId: m.userId,
      label: `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
    });
    map.set(m.teamEntryId, list);
  }
  return map;
}

/**
 * スナップショット由来のチーム参照を、DB の TeamEntryMember に基づき構成員ごとに展開する。
 * メンバー未割当のチームは 1 行（teamMemberUserId null）のまま残す。
 */
export async function expandTeamMarshalRefsWithMembers(
  prisma: TeamMemberScopedDb,
  refs: MarshalParticipantRef[]
): Promise<MarshalParticipantRef[]> {
  const teamIds = refs
    .filter((r) => r.participantType === "TEAM" && r.teamEntryId)
    .map((r) => r.teamEntryId!);
  if (teamIds.length === 0) return refs;

  const membersMap = await fetchTeamMembersMapForTeamIds(prisma, teamIds);
  const byTeam = new Map<string, string[]>();
  for (const [teamId, members] of membersMap) {
    const list = byTeam.get(teamId) ?? [];
    for (const m of members) list.push(m.userId);
    byTeam.set(teamId, list);
  }

  const out: MarshalParticipantRef[] = [];
  for (const ref of refs) {
    if (ref.participantType !== "TEAM" || !ref.teamEntryId) {
      out.push(ref);
      continue;
    }
    const uids = byTeam.get(ref.teamEntryId) ?? [];
    if (uids.length === 0) {
      out.push({ ...ref, teamMemberUserId: null });
    } else {
      for (const uid of uids) {
        out.push({ ...ref, teamMemberUserId: uid });
      }
    }
  }
  return out;
}
