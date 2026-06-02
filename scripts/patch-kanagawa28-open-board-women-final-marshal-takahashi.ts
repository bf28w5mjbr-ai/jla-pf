/**
 * 第28回神奈川：オープンボードレース（女子）決勝 L1
 * 髙橋 若菜 のマーシャル状態を CALLED（マーシャル済）に設定。
 * 誤って CALLED になっていた 高橋 陽（FINAL）を除去。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-women-final-marshal-takahashi.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/patch-kanagawa28-open-board-women-final-marshal-takahashi.ts --execute
 */
import { prisma } from "@/server/db";

const COMPETITION_ID = "cmnugqbxx000gjs04y449vpnv";
const EVENT_ID = "cmnwtnhxi0005jr04atytm9jr";

const WRONG_ENTRY_ID = "cmowq5ei60010la04vpszcmot"; // 高橋 陽
const CORRECT_ENTRY_ID = "cmojmr0kw0005l204jcwrcadw"; // 髙橋 若菜
const MARSHAL_ROUND = "FINAL" as const;
const REASON = "決勝マーシャル（手動差し替え）";

const execute = process.argv.includes("--execute");
const dryRun = !execute;

async function main() {
  console.log(dryRun ? "[dry-run]" : "[execute]");

  const [wrongFinal, correctFinal] = await Promise.all([
    prisma.competitionParticipantStatus.findFirst({
      where: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        competitionEntryId: WRONG_ENTRY_ID,
        marshalRound: MARSHAL_ROUND,
      },
      select: { id: true, status: true, calledAt: true },
    }),
    prisma.competitionParticipantStatus.findFirst({
      where: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        competitionEntryId: CORRECT_ENTRY_ID,
        marshalRound: MARSHAL_ROUND,
      },
      select: { id: true, status: true, calledAt: true },
    }),
  ]);

  console.log("高橋 陽 FINAL status:", wrongFinal ?? "なし");
  console.log("髙橋 若菜 FINAL status:", correctFinal ?? "なし");

  if (correctFinal?.status === "CALLED") {
    console.log("髙橋 若菜 は既にマーシャル済です");
    if (!wrongFinal) return;
  }

  const calledAt = wrongFinal?.calledAt ?? new Date();

  if (dryRun) {
    console.log("\n予定:");
    if (wrongFinal) console.log(`  - 削除: 高橋 陽 FINAL (${wrongFinal.id})`);
    if (correctFinal) {
      console.log(`  - 更新: 髙橋 若菜 FINAL → CALLED (${correctFinal.id})`);
    } else {
      console.log("  - 作成: 髙橋 若菜 FINAL → CALLED");
    }
    return;
  }

  if (wrongFinal) {
    await prisma.competitionParticipantStatus.delete({ where: { id: wrongFinal.id } });
    console.log("削除: 高橋 陽 FINAL CALLED");
  }

  if (correctFinal) {
    await prisma.competitionParticipantStatus.update({
      where: { id: correctFinal.id },
      data: { status: "CALLED", reason: REASON, calledAt },
    });
    console.log("更新: 髙橋 若菜 FINAL → CALLED");
  } else {
    await prisma.competitionParticipantStatus.create({
      data: {
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        participantType: "INDIVIDUAL",
        competitionEntryId: CORRECT_ENTRY_ID,
        teamEntryId: null,
        teamMemberUserId: null,
        marshalRound: MARSHAL_ROUND,
        status: "CALLED",
        reason: REASON,
        calledAt,
      },
    });
    console.log("作成: 髙橋 若菜 FINAL → CALLED");
  }

  console.log("\n[execute] マーシャル状態を更新しました");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
