/**
 * 第28回神奈川県ライフセービング選手権大会における、志賀海征の
 * - 個人エントリー（CompetitionEntry: 紐づく EntrySnapshot / EntryItem は Cascade で削除）
 * - 本大会のチームメンバー登録（TeamEntryMember のうち、本大会の TeamEntry に属するもののみ）
 * を物理削除する。
 *
 * SetNull で孤立化する関連レコード（EntryCheckoutSession.entryId / OfficialResultRow /
 * CompetitionParticipantStatus / CompetitionResultDraftRow / ClubCompetitionPrepaidIndividualSlot.consumedByEntryId）
 * は削除せず、影響をレポート出力する。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local \
 *     scripts/delete-competition-entries-kanagawa28-shiga-kaisei.ts \
 *     --user-email="..." --dry-run
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local \
 *     scripts/delete-competition-entries-kanagawa28-shiga-kaisei.ts \
 *     --user-email="..." --execute
 *
 * --dry-run: 大会・ユーザー・関連レコードを検索し、削除対象と影響を表示するだけ。
 * --execute: 検証後、トランザクションで TeamEntryMember (本大会のみ) と CompetitionEntry を deleteMany する。
 *            --dry-run と同時指定は不可。
 *
 * オプション:
 *   --user-email="..."           対象ユーザーのメール（必須・同姓同名対策の安全弁）
 *   --competition-name="..."     大会名の上書き（既定は第28回神奈川県ライフセービング選手権大会）
 */
import { prisma } from "@/server/db";

const DEFAULT_COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_CONTAINS_FALLBACK = "第28回神奈川県ライフセービング選手権";

const TARGET_FAMILY_NAME = "志賀";
const TARGET_GIVEN_NAME = "海征";

type ParsedArgs = {
  mode: "dry-run" | "execute";
  competitionNameOverride: string | null;
  userEmail: string;
};

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  let hasDry = false;
  let hasExecute = false;
  let competitionNameOverride: string | null = null;
  let userEmail: string | null = null;
  for (const a of argv) {
    if (a === "--dry-run") hasDry = true;
    else if (a === "--execute") hasExecute = true;
    else if (a.startsWith("--competition-name=")) {
      competitionNameOverride = a.slice("--competition-name=".length).trim() || null;
    } else if (a.startsWith("--user-email=")) {
      userEmail = a.slice("--user-email=".length).trim() || null;
    }
  }
  if (hasDry && hasExecute) {
    console.error("エラー: --dry-run と --execute は同時に指定できません。");
    process.exit(1);
  }
  if (!hasDry && !hasExecute) {
    console.error("エラー: --dry-run または --execute のいずれかを指定してください。");
    process.exit(1);
  }
  if (!userEmail) {
    console.error('エラー: --user-email="..." は必須です（同姓同名対策の安全弁）。');
    process.exit(1);
  }
  return {
    mode: hasExecute ? "execute" : "dry-run",
    competitionNameOverride,
    userEmail,
  };
}

async function resolveCompetition(exactName: string) {
  let comp = await prisma.competition.findFirst({
    where: { name: exactName },
    select: { id: true, name: true },
  });
  if (comp) return comp;

  const candidates = await prisma.competition.findMany({
    where: { name: { contains: NAME_CONTAINS_FALLBACK } },
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  });
  if (candidates.length === 0) {
    console.error(
      `大会が見つかりません。名前の完全一致「${exactName}」および contains「${NAME_CONTAINS_FALLBACK}」で検索しました。`
    );
    return null;
  }
  if (candidates.length > 1) {
    console.error(
      `大会候補が ${candidates.length} 件あります。--competition-name で一意に指定するか、DBを確認してください:`
    );
    for (const c of candidates) {
      console.error(`  - id=${c.id} name=${c.name}`);
    }
    return null;
  }
  return candidates[0];
}

type TargetUser = {
  id: string;
  email: string;
  familyName: string;
  givenName: string;
};

async function resolveTargetUser(email: string): Promise<
  | { ok: true; user: TargetUser }
  | { ok: false; message: string; raw: TargetUser[] }
> {
  const raw = await prisma.user.findMany({
    where: {
      familyName: TARGET_FAMILY_NAME,
      givenName: TARGET_GIVEN_NAME,
      email,
    },
    select: {
      id: true,
      email: true,
      familyName: true,
      givenName: true,
    },
  });

  if (raw.length === 0) {
    const sameName = await prisma.user.findMany({
      where: { familyName: TARGET_FAMILY_NAME, givenName: TARGET_GIVEN_NAME },
      select: { id: true, email: true, familyName: true, givenName: true },
    });
    return {
      ok: false,
      message: `「${TARGET_FAMILY_NAME}${TARGET_GIVEN_NAME}」かつ email="${email}" のユーザーが見つかりません。`,
      raw: sameName,
    };
  }
  if (raw.length > 1) {
    return {
      ok: false,
      message: `「${TARGET_FAMILY_NAME}${TARGET_GIVEN_NAME}」かつ email="${email}" に一致するユーザーが ${raw.length} 件あります（1件である必要があります）。`,
      raw,
    };
  }
  return { ok: true, user: raw[0] };
}

async function main() {
  const { mode, competitionNameOverride, userEmail } = parseArgs();
  const competitionName = competitionNameOverride ?? DEFAULT_COMPETITION_NAME;

  console.log(`[mode] ${mode}`);
  console.log(`[competition name] ${competitionName}`);
  console.log(`[target] familyName=${TARGET_FAMILY_NAME} givenName=${TARGET_GIVEN_NAME} email=${userEmail}`);

  const competition = await resolveCompetition(competitionName);
  if (!competition) {
    process.exit(1);
  }
  console.log(`[competition] id=${competition.id} name=${competition.name}`);

  const resolved = await resolveTargetUser(userEmail);
  if (!resolved.ok) {
    console.error(resolved.message);
    if (resolved.raw.length > 0) {
      console.error("[同姓同名 raw matches]");
      for (const u of resolved.raw) {
        console.error(`  - id=${u.id} ${u.familyName} ${u.givenName} <${u.email}>`);
      }
    }
    process.exit(1);
  }
  const user = resolved.user;
  console.log(`[user] id=${user.id} ${user.familyName} ${user.givenName} <${user.email}>`);

  // ---- 削除対象: CompetitionEntry ----
  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: competition.id,
      userId: user.id,
    },
    include: {
      items: {
        include: {
          event: { select: { name: true, sex: true } },
        },
      },
      checkoutSessions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          amount: true,
          stripeCheckoutSessionId: true,
        },
      },
    },
  });

  console.log(`\n[CompetitionEntry to delete] ${entries.length} 件`);
  let totalFeeSum = 0;
  for (const e of entries) {
    totalFeeSum += e.totalFee;
    const events = e.items
      .map((i) => `${i.event?.name ?? i.eventId} (${i.event?.sex ?? "?"})`)
      .join(", ");
    console.log(
      `  - entryId=${e.id} status=${e.status} totalFee=${e.totalFee} createdAt=${e.createdAt.toISOString()}`
    );
    console.log(`    events: ${events || "(なし)"}`);
    if (e.checkoutSessions.length > 0) {
      const s = e.checkoutSessions[0];
      console.log(
        `    latest checkout: id=${s.id} status=${s.status} amount=${s.amount} session=${s.stripeCheckoutSessionId ?? "—"}`
      );
    }
    if (e.totalFee > 0) {
      console.warn(
        `    [warn] totalFee>0 (${e.totalFee}) — Stripe の返金はこのスクリプトでは行いません。会計を確認してください。`
      );
    }
  }

  const entryIds = entries.map((e) => e.id);

  // ---- 削除対象: TeamEntryMember (本大会の TeamEntry に属するメンバー行のみ) ----
  const teamEntriesAll = await prisma.teamEntry.findMany({
    where: { competitionId: competition.id },
    select: {
      id: true,
      teamName: true,
      event: { select: { name: true, sex: true } },
      members: {
        select: { id: true, userId: true, role: true, order: true },
      },
    },
  });

  const teamMembersToDelete = teamEntriesAll
    .map((te) => {
      const mine = te.members.filter((m) => m.userId === user.id);
      if (mine.length === 0) return null;
      return {
        teamEntryId: te.id,
        teamName: te.teamName,
        eventName: te.event?.name ?? null,
        eventSex: te.event?.sex ?? null,
        myRows: mine,
        otherMemberCount: te.members.length - mine.length,
      };
    })
    .filter((v) => v !== null);

  console.log(`\n[TeamEntryMember to delete] ${teamMembersToDelete.length} 件 (本大会の TeamEntry 内のみ)`);
  for (const t of teamMembersToDelete) {
    console.log(
      `  - teamEntryId=${t.teamEntryId} teamName="${t.teamName}" event=${t.eventName ?? "?"} (${t.eventSex ?? "?"}) otherMembers=${t.otherMemberCount}`
    );
    for (const m of t.myRows) {
      console.log(`    memberId=${m.id} role=${m.role ?? "—"} order=${m.order ?? "—"}`);
    }
  }

  // ---- 参考レポート: ClubPrepaidIndividualSlot ----
  const prepaidSlots = await prisma.clubCompetitionPrepaidIndividualSlot.findMany({
    where: {
      competitionId: competition.id,
      coveredUserId: user.id,
    },
    select: {
      id: true,
      status: true,
      consumedByEntryId: true,
      clubPaymentId: true,
      consumedAt: true,
      club: { select: { id: true, name: true } },
    },
  });
  console.log(`\n[ClubPrepaidIndividualSlot for this user/competition] ${prepaidSlots.length} 件`);
  let consumedSlotCount = 0;
  for (const s of prepaidSlots) {
    if (s.status === "CONSUMED") consumedSlotCount += 1;
    console.log(
      `  - slotId=${s.id} club="${s.club?.name ?? s.club?.id ?? "?"}" status=${s.status} consumedByEntryId=${s.consumedByEntryId ?? "—"} consumedAt=${s.consumedAt?.toISOString() ?? "—"} clubPaymentId=${s.clubPaymentId ?? "—"}`
    );
  }
  if (consumedSlotCount > 0) {
    console.warn(
      `  [warn] CONSUMED 状態のクラブ先払い枠が ${consumedSlotCount} 件あります。エントリー削除後は consumedByEntryId が null になります。\n         必要に応じて src/lib/clubPrepaidIndividualSlotRetroactiveReconcile.ts 系の再評価を運用判断で実施してください。`
    );
  }

  // ---- 参考レポート: SetNull で孤立化する行 ----
  let orphanCheckoutCount = 0;
  let orphanOfficialResultCount = 0;
  let orphanParticipantStatusCount = 0;
  let orphanResultDraftRowCount = 0;
  if (entryIds.length > 0) {
    [
      orphanCheckoutCount,
      orphanOfficialResultCount,
      orphanParticipantStatusCount,
      orphanResultDraftRowCount,
    ] = await Promise.all([
      prisma.entryCheckoutSession.count({ where: { entryId: { in: entryIds } } }),
      prisma.officialResultRow.count({ where: { competitionEntryId: { in: entryIds } } }),
      prisma.competitionParticipantStatus.count({
        where: { competitionEntryId: { in: entryIds } },
      }),
      prisma.competitionResultDraftRow.count({
        where: { competitionEntryId: { in: entryIds } },
      }),
    ]);
  }

  console.log(`\n[SetNull で孤立化する関連行（削除はしない）]`);
  console.log(`  - EntryCheckoutSession.entryId → null: ${orphanCheckoutCount} 件`);
  console.log(`  - OfficialResultRow.competitionEntryId → null: ${orphanOfficialResultCount} 件`);
  console.log(
    `  - CompetitionParticipantStatus.competitionEntryId → null: ${orphanParticipantStatusCount} 件`
  );
  console.log(
    `  - CompetitionResultDraftRow.competitionEntryId → null: ${orphanResultDraftRowCount} 件`
  );
  if (orphanOfficialResultCount > 0) {
    console.warn(
      `  [warn] OfficialResultRow が ${orphanOfficialResultCount} 件あります。公式結果からエントリー紐付けが外れます（rank/値は残存、entry 参照のみ null）。`
    );
  }

  // ---- 参考: 当日点呼（削除対象外） ----
  const dayCheckins = await prisma.competitionDayCheckin.count({
    where: { competitionId: competition.id, userId: user.id },
  });
  console.log(`\n[参考] CompetitionDayCheckin (本大会・本人): ${dayCheckins} 件 (削除対象外)`);

  console.log(
    `\n[summary] CompetitionEntry: ${entries.length} 件 (totalFee 合計=${totalFeeSum}), TeamEntryMember: ${teamMembersToDelete.length} 件`
  );

  if (entries.length === 0 && teamMembersToDelete.length === 0) {
    console.log("\n削除対象がありません。終了します。");
    return;
  }

  if (mode === "dry-run") {
    console.log("\n--dry-run のため削除は行いません。実行する場合は --execute を指定してください。");
    return;
  }

  const teamEntryIdsForCompetition = teamEntriesAll.map((t) => t.id);

  const result = await prisma.$transaction(async (tx) => {
    const memberDeleted =
      teamEntryIdsForCompetition.length > 0
        ? await tx.teamEntryMember.deleteMany({
            where: {
              userId: user.id,
              teamEntryId: { in: teamEntryIdsForCompetition },
            },
          })
        : { count: 0 };

    const entryDeleted = await tx.competitionEntry.deleteMany({
      where: {
        competitionId: competition.id,
        userId: user.id,
      },
    });

    return { memberDeleted: memberDeleted.count, entryDeleted: entryDeleted.count };
  });

  console.log(
    `\n[done] CompetitionEntry: ${result.entryDeleted} 件削除 / TeamEntryMember: ${result.memberDeleted} 件削除`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
