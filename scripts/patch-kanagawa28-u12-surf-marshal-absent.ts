/**
 * 第28回神奈川：U-12 サーフレース ヒート1 レーン1 豊間根 一樹 をマーシャル未完了（DNS）に処理。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u12-surf-marshal-absent.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-u12-surf-marshal-absent.ts --execute
 */
import { loadStartListSnapshotPayload } from "@/lib/heatMarshalGate";
import { getRoundDataFromSnapshot } from "@/lib/heatMarshalFromSnapshot";
import { prisma } from "@/server/db";

const COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "神奈川県ライフセービング";
/** スタートリスト URL の種目 ID（U-12 サーフレース・男子想定） */
const EVENT_ID = "cmnulws110000l404zw6mrjlr";
const TARGET_FAMILY = "豊間根";
const TARGET_GIVEN = "一樹";
const HEAT_INDEX = 1;
const MARSHAL_ROUND = "HEAT" as const;
const REASON = "マーシャル未完了により欠場（未出場）扱い";

const execute = process.argv.includes("--execute");
const dryRun = !execute;

async function findCompetition() {
  let comp = await prisma.competition.findFirst({
    where: { name: COMPETITION_NAME },
    select: { id: true, name: true },
  });
  if (!comp) {
    comp = await prisma.competition.findFirst({
      where: { name: { contains: NAME_FALLBACK } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    });
  }
  return comp;
}

function nameMatches(familyName: string, givenName: string, displayName: string): boolean {
  const fn = familyName.trim();
  const gn = givenName.trim();
  const dn = displayName.replace(/\s+/g, " ").trim();
  if (fn.includes(TARGET_FAMILY) && (gn.includes(TARGET_GIVEN) || dn.includes(`${TARGET_FAMILY} ${TARGET_GIVEN}`))) {
    return true;
  }
  return dn.includes(`${TARGET_FAMILY}`) && dn.includes(TARGET_GIVEN);
}

async function main() {
  const comp = await findCompetition();
  if (!comp) {
    console.error(`大会が見つかりません: ${COMPETITION_NAME}`);
    process.exit(1);
  }
  console.log("competition:", comp.id, comp.name);

  const event = await prisma.event.findFirst({
    where: { id: EVENT_ID, competitionId: comp.id },
    select: {
      id: true,
      name: true,
      sex: true,
      ageCategory: { select: { name: true } },
    },
  });
  if (!event) {
    console.error(`種目が見つかりません: ${EVENT_ID}`);
    process.exit(1);
  }
  console.log("event:", event.id, event.name, event.sex, event.ageCategory?.name);

  const snapshot = await loadStartListSnapshotPayload(comp.id);
  const round = getRoundDataFromSnapshot(snapshot, event.id, MARSHAL_ROUND);
  const heat = round?.heats?.find((h) => Number(h.heatIndex) === HEAT_INDEX);
  if (!heat) {
    console.error("ヒート1がスナップショットにありません");
    process.exit(1);
  }

  console.log(
    "heat1 participants (lane order):",
    heat.participants?.map((p, i) => `${i + 1}: ${p.kind === "INDIVIDUAL" ? p.name : p.teamName}`)
  );

  const lane1 = heat.participants?.[0];
  if (!lane1 || lane1.kind !== "INDIVIDUAL") {
    console.error("レーン1が個人参加者ではありません");
    process.exit(1);
  }

  const entry = await prisma.competitionEntry.findFirst({
    where: { id: lane1.entryId },
    select: {
      id: true,
      club: { select: { name: true } },
      user: { select: { profile: { select: { familyName: true, givenName: true } } } },
    },
  });

  const fn = entry?.user.profile?.familyName ?? "";
  const gn = entry?.user.profile?.givenName ?? "";
  const displayName = lane1.name;

  console.log("\ntarget lane1:", displayName, `(${fn} ${gn})`, entry?.club?.name, "entryId:", lane1.entryId);

  if (!nameMatches(fn, gn, displayName)) {
    console.error("レーン1が豊間根 一樹ではありません。スナップショットを確認してください。");
    process.exit(1);
  }

  const existing = await prisma.competitionParticipantStatus.findFirst({
    where: {
      competitionId: comp.id,
      eventId: event.id,
      marshalRound: MARSHAL_ROUND,
      participantType: "INDIVIDUAL",
      competitionEntryId: lane1.entryId,
    },
  });

  const marshalState = await prisma.competitionHeatMarshalState.findFirst({
    where: {
      competitionId: comp.id,
      eventId: event.id,
      round: MARSHAL_ROUND,
      heatIndex: HEAT_INDEX,
    },
  });

  const official = await prisma.officialResult.findUnique({
    where: {
      competitionId_eventId_round: {
        competitionId: comp.id,
        eventId: event.id,
        round: MARSHAL_ROUND,
      },
    },
    select: {
      id: true,
      rows: {
        where: { heat: HEAT_INDEX, competitionEntryId: lane1.entryId },
        select: { id: true, rank: true, status: true },
      },
      heatConfirmations: { where: { heat: HEAT_INDEX }, select: { id: true } },
    },
  });

  console.log("\ncurrent status:", existing?.status ?? "(none → PENDING 表示)");
  console.log("reason:", existing?.reason ?? "—");
  console.log("calledAt:", existing?.calledAt?.toISOString() ?? "—");
  console.log("heat marshal closed:", marshalState?.callClosedAt?.toISOString() ?? "no");
  console.log("official result rows:", official?.rows ?? []);
  console.log("heat confirmed:", (official?.heatConfirmations.length ?? 0) > 0);

  if (existing?.status === "DNS" && existing.reason?.includes("マーシャル未完了")) {
    console.log("\n→ 既にマーシャル未完了（DNS）処理済み");
    return;
  }

  if (dryRun) {
    console.log("\n[dry-run] Would:");
    console.log("  - set competitionParticipantStatus → DNS, reason:", REASON);
    console.log("  - clear calledAt");
    if (official?.rows.length) {
      console.log("  - delete official result rows for this entry in heat 1:", official.rows.map((r) => r.id));
    }
    if (!marshalState?.callClosedAt) {
      console.log("  - close marshal for heat 1 (callClosedAt=now)");
    }
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.competitionParticipantStatus.update({
        where: { id: existing.id },
        data: {
          status: "DNS",
          reason: REASON,
          calledAt: null,
          updatedAt: now,
        },
      });
    } else {
      await tx.competitionParticipantStatus.create({
        data: {
          competitionId: comp.id,
          eventId: event.id,
          participantType: "INDIVIDUAL",
          competitionEntryId: lane1.entryId,
          teamEntryId: null,
          teamMemberUserId: null,
          marshalRound: MARSHAL_ROUND,
          status: "DNS",
          reason: REASON,
          calledAt: null,
        },
      });
    }

    if (official?.rows.length) {
      await tx.officialResultRow.deleteMany({
        where: { id: { in: official.rows.map((r) => r.id) } },
      });
    }

    await tx.competitionHeatMarshalState.upsert({
      where: {
        competitionId_eventId_round_heatIndex: {
          competitionId: comp.id,
          eventId: event.id,
          round: MARSHAL_ROUND,
          heatIndex: HEAT_INDEX,
        },
      },
      create: {
        competitionId: comp.id,
        eventId: event.id,
        round: MARSHAL_ROUND,
        heatIndex: HEAT_INDEX,
        callClosedAt: now,
      },
      update: {
        callClosedAt: now,
      },
    });
  });

  console.log("\n[execute] 豊間根 一樹 を DNS（マーシャル未完了）に更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
