/**
 * 第28回神奈川県ライフセービング選手権大会における、指定2名の個人エントリー（CompetitionEntry）を物理削除する。
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/delete-competition-entries-kanagawa28-two-users.ts --dry-run
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/delete-competition-entries-kanagawa28-two-users.ts --execute
 *
 * --dry-run: 大会・ユーザー・エントリーを検索し、削除対象を表示するだけ（デフォルト相当）。
 * --execute: 検証後、トランザクションで deleteMany する（--dry-run と同時指定不可）。
 *
 * 任意: --competition-name="大会名" で大会名を上書き。
 */
import { prisma } from "@/server/db";

const DEFAULT_COMPETITION_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_CONTAINS_FALLBACK = "第28回神奈川県ライフセービング選手権";

type ParsedArgs = {
  mode: "dry-run" | "execute";
  competitionNameOverride: string | null;
};

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  let hasDry = false;
  let hasExecute = false;
  let competitionNameOverride: string | null = null;
  for (const a of argv) {
    if (a === "--dry-run") hasDry = true;
    else if (a === "--execute") hasExecute = true;
    else if (a.startsWith("--competition-name=")) {
      competitionNameOverride = a.slice("--competition-name=".length).trim() || null;
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
  return {
    mode: hasExecute ? "execute" : "dry-run",
    competitionNameOverride,
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

/** 計画どおり: 青木将展、葺本康隆（表記ゆれで茸本も候補。両方いる場合は曖昧なので中止） */
async function resolveTargetUsers(): Promise<
  | { ok: true; users: TargetUser[] }
  | { ok: false; message: string; raw: TargetUser[] }
> {
  const raw = await prisma.user.findMany({
    where: {
      OR: [
        { familyName: "青木", givenName: "将展" },
        { familyName: "葺本", givenName: "康隆" },
        { familyName: "茸本", givenName: "康隆" },
      ],
    },
    select: {
      id: true,
      email: true,
      familyName: true,
      givenName: true,
    },
  });

  const aoki = raw.filter((u) => u.familyName === "青木" && u.givenName === "将展");
  const fuki = raw.filter((u) => u.familyName === "葺本" && u.givenName === "康隆");
  const shiba = raw.filter((u) => u.familyName === "茸本" && u.givenName === "康隆");

  if (aoki.length !== 1) {
    return {
      ok: false,
      message: `「青木将展」に一致するユーザーが ${aoki.length} 件です（1件である必要があります）。`,
      raw,
    };
  }
  if (fuki.length > 0 && shiba.length > 0) {
    return {
      ok: false,
      message:
        "「葺本康隆」と「茸本康隆」の両方がDBに存在します。どちらを対象にするか整理してから --competition-name とあわせて手動で userId を確定してください。",
      raw,
    };
  }
  const yasushi = fuki[0] ?? shiba[0];
  if (!yasushi) {
    return {
      ok: false,
      message:
        "「葺本康隆」または「茸本康隆」に一致するユーザーが0件です。氏名の登録を確認してください。",
      raw,
    };
  }

  const users: TargetUser[] = [aoki[0], yasushi];
  if (users[0].id === users[1].id) {
    return { ok: false, message: "同一ユーザーが二重に選ばれています。", raw };
  }

  return { ok: true, users };
}

async function main() {
  const { mode, competitionNameOverride } = parseArgs();
  const competitionName = competitionNameOverride ?? DEFAULT_COMPETITION_NAME;

  console.log(`[mode] ${mode}`);
  console.log(`[competition name] ${competitionName}`);

  const competition = await resolveCompetition(competitionName);
  if (!competition) {
    process.exit(1);
  }
  console.log(`[competition] id=${competition.id} name=${competition.name}`);

  const resolved = await resolveTargetUsers();
  if (!resolved.ok) {
    console.error(resolved.message);
    if (resolved.raw.length > 0) {
      console.error("[raw matches]");
      for (const u of resolved.raw) {
        console.error(`  - id=${u.id} ${u.familyName} ${u.givenName} <${u.email}>`);
      }
    }
    process.exit(1);
  }
  const users = resolved.users;
  console.log(`[users matched] ${users.length} 件`);
  for (const u of users) {
    console.log(`  - id=${u.id} ${u.familyName} ${u.givenName} <${u.email}>`);
  }

  const userIds = users.map((u) => u.id);

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId: competition.id,
      userId: { in: userIds },
    },
    include: {
      user: { select: { email: true, familyName: true, givenName: true } },
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

  console.log(`\n[entries to delete] ${entries.length} 件`);
  for (const e of entries) {
    const events = e.items
      .map((i) => `${i.event?.name ?? i.eventId} (${i.event?.sex ?? "?"})`)
      .join(", ");
    console.log(
      `  - entryId=${e.id} userId=${e.userId} status=${e.status} totalFee=${e.totalFee} createdAt=${e.createdAt.toISOString()}`
    );
    console.log(`    user: ${e.user.familyName} ${e.user.givenName} <${e.user.email}>`);
    console.log(`    events: ${events || "(なし)"}`);
    if (e.checkoutSessions.length > 0) {
      const s = e.checkoutSessions[0];
      console.log(
        `    latest checkout: id=${s.id} status=${s.status} amount=${s.amount} session=${s.stripeCheckoutSessionId ?? "—"}`
      );
    }
    if (e.totalFee > 0 && mode === "execute") {
      console.warn(
        `    [warn] totalFee>0 — Stripe の返金はこのスクリプトでは行いません。会計を確認してください。`
      );
    }
  }

  if (entries.length === 0) {
    console.log("\n削除対象のエントリーはありません。終了します。");
    return;
  }

  if (mode === "dry-run") {
    console.log("\n--dry-run のため削除は行いません。実行する場合は --execute を指定してください。");
    return;
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.competitionEntry.deleteMany({
      where: {
        competitionId: competition.id,
        userId: { in: userIds },
      },
    });
    return result.count;
  });

  console.log(`\n[done] CompetitionEntry を ${deleted} 件削除しました。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
