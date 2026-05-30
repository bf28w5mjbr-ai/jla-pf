/** エントリー提出時に付与される内部マーカー（割当 UI・スタートリスト表示対象外） */
export const TEAM_ENTRY_APPLICANT_ROLE = "申請者";

export type TeamEntryMemberRow = {
  userId: string;
  order: number | null;
  role?: string | null;
};

export type TeamEntryAssignmentDto = {
  teamEntryId: string;
  eventId: string;
  eventName: string;
  sexLabel: string;
  teamName: string;
  relayPositionCount: number | null;
  relayPositionLabels: string[];
  memberSlots: (string | null)[];
};

export function isAssignableTeamEntryMember(member: { role?: string | null }): boolean {
  return member.role !== TEAM_ENTRY_APPLICANT_ROLE;
}

export function filterAssignableTeamEntryMembers<T extends { role?: string | null }>(
  members: readonly T[]
): T[] {
  return members.filter(isAssignableTeamEntryMember);
}

export function parseRelayPositionNames(raw: unknown): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveTeamRelaySlotCount(
  configured: number | null | undefined,
  members: ReadonlyArray<Pick<TeamEntryMemberRow, "order">>
): number {
  const assignable = filterAssignableTeamEntryMembers(
    members as ReadonlyArray<TeamEntryMemberRow>
  );
  if (typeof configured === "number" && configured >= 1 && configured <= 32) {
    return configured;
  }
  const maxOrder = assignable.reduce((acc, m) => Math.max(acc, m.order ?? 0), 0);
  return Math.min(32, Math.max(maxOrder, assignable.length, 1));
}

export function buildMemberSlotsFromDb(
  members: ReadonlyArray<TeamEntryMemberRow>,
  slotCount: number
): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: slotCount }, () => null);
  const sorted = [...filterAssignableTeamEntryMembers(members)].sort((a, b) => {
    const ao = a.order ?? 999;
    const bo = b.order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.userId.localeCompare(b.userId);
  });
  let fillCursor = 0;
  for (const m of sorted) {
    if (m.order != null && m.order >= 1) {
      const idx = m.order - 1;
      if (idx < slotCount) slots[idx] = m.userId;
    } else {
      while (fillCursor < slotCount && slots[fillCursor] != null) fillCursor++;
      if (fillCursor < slotCount) {
        slots[fillCursor] = m.userId;
        fillCursor++;
      }
    }
  }
  return slots;
}

export type MemberSlotsValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateMemberSlotsForSave(params: {
  memberSlots: readonly (string | null)[];
  expectedSlotCount: number;
  teamLabel?: string;
}): MemberSlotsValidationResult {
  const { memberSlots, expectedSlotCount, teamLabel } = params;
  const prefix = teamLabel ? `${teamLabel}: ` : "";

  if (memberSlots.length !== expectedSlotCount) {
    return {
      ok: false,
      message: `${prefix}ポジション数が種目設定（${expectedSlotCount}）と一致しません`,
    };
  }

  const filled = memberSlots.filter(Boolean).length;
  const total = memberSlots.length;

  if (filled > 0 && filled < total) {
    return {
      ok: false,
      message: `${prefix}1 枠以上割り当てた場合は全ポジションの割当が必要です`,
    };
  }

  const used = new Set<string>();
  for (const uid of memberSlots) {
    if (!uid) continue;
    if (used.has(uid)) {
      return {
        ok: false,
        message: `${prefix}同じメンバーを複数の配属に入れることはできません`,
      };
    }
    used.add(uid);
  }

  return { ok: true };
}

export function normalizeMemberSlotsInput(raw: unknown): (string | null)[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((cell) => {
    if (cell === null || cell === undefined || cell === "") return null;
    return typeof cell === "string" ? cell : null;
  });
}

export function findPartialAssignmentTeamLabels(
  assignments: ReadonlyArray<{ teamName: string; memberSlots: readonly (string | null)[] }>
): string[] {
  return assignments
    .filter((a) => {
      const filled = a.memberSlots.filter(Boolean).length;
      return filled > 0 && filled < a.memberSlots.length;
    })
    .map((a) => a.teamName);
}

type MemberProfileRow = {
  role?: string | null;
  user: {
    profile: { familyName: string | null; givenName: string | null } | null;
  };
};

/** スタートリスト表示用: 申請者を除いた構成員名 */
export function formatAssignableTeamMemberNames(
  members: ReadonlyArray<MemberProfileRow>
): string[] {
  return filterAssignableTeamEntryMembers(members)
    .map(
      (m) =>
        `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim()
    )
    .filter(Boolean);
}
