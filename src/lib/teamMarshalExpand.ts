import type { PrismaClient } from "@prisma/client";
import type { MarshalParticipantRef } from "@/lib/heatMarshalFromSnapshot";

/**
 * スナップショット由来のチーム参照を、DB の TeamEntryMember に基づき構成員ごとに展開する。
 * メンバー未割当のチームは 1 行（teamMemberUserId null）のまま残す。
 */
export async function expandTeamMarshalRefsWithMembers(
  prisma: Pick<PrismaClient, "teamEntryMember">,
  refs: MarshalParticipantRef[]
): Promise<MarshalParticipantRef[]> {
  const teamIds = refs
    .filter((r) => r.participantType === "TEAM" && r.teamEntryId)
    .map((r) => r.teamEntryId!);
  if (teamIds.length === 0) return refs;

  const members = await prisma.teamEntryMember.findMany({
    where: { teamEntryId: { in: teamIds } },
    select: { teamEntryId: true, userId: true },
    orderBy: { order: "asc" },
  });
  const byTeam = new Map<string, string[]>();
  for (const m of members) {
    const list = byTeam.get(m.teamEntryId) ?? [];
    list.push(m.userId);
    byTeam.set(m.teamEntryId, list);
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
