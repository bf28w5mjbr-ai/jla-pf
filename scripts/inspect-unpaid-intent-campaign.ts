/**
 * 未決済出場意思確認キャンペーンの実データと管理画面サマリーの突合。
 *
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/inspect-unpaid-intent-campaign.ts
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env scripts/inspect-unpaid-intent-campaign.ts --competition-name="第28回神奈川県ライフセービング選手権大会"
 */
import type { EntryCheckoutSessionStatus } from "@prisma/client";
import { isEntryEstablished } from "../src/lib/entryFinalization";
import { isEntryFeeSettled } from "../src/lib/entryOrganizerPostPay";
import { prisma } from "../src/server/db";

const DEFAULT_NAME = "第28回神奈川県ライフセービング選手権大会";
const NAME_FALLBACK = "第28回神奈川県ライフセービング選手権";

function parseArgs(): { competitionName: string } {
  const arg = process.argv.find((a) => a.startsWith("--competition-name="));
  return {
    competitionName: arg?.slice("--competition-name=".length) || DEFAULT_NAME,
  };
}

function entryLike(entry: {
  status: string;
  totalFee: number;
  clubIndividualFeePaidAt: Date | null;
  organizerPostPayApprovedAt: Date | null;
  organizerManualPaidAt: Date | null;
  checkoutSessions: { status: string }[];
}) {
  return {
    status: entry.status as "SUBMITTED" | "CANCELLED",
    totalFee: entry.totalFee,
    clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt,
    organizerPostPayApprovedAt: entry.organizerPostPayApprovedAt,
    organizerManualPaidAt: entry.organizerManualPaidAt,
    checkoutSessions: entry.checkoutSessions.map((s) => ({
      status: s.status as EntryCheckoutSessionStatus,
    })),
  };
}

function fullName(profile: { familyName: string | null; givenName: string | null } | null): string {
  return `${profile?.familyName ?? ""} ${profile?.givenName ?? ""}`.trim() || "—";
}

async function findCompetition(name: string) {
  let comp = await prisma.competition.findFirst({
    where: { name },
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

async function main() {
  const { competitionName } = parseArgs();
  const comp = await findCompetition(competitionName);
  if (!comp) {
    console.error(`大会が見つかりません: ${competitionName}`);
    process.exit(1);
  }
  console.log(`\n=== ${comp.name} (${comp.id}) ===\n`);

  const campaigns = await prisma.competitionUnpaidEntryIntentCampaign.findMany({
    where: { competitionId: comp.id },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      sentAt: true,
      responseDeadlineAt: true,
      sentByUserId: true,
      _count: { select: { tokens: true } },
    },
  });

  if (campaigns.length === 0) {
    console.log("出場意思確認キャンペーンはありません。");
    return;
  }

  console.log(`キャンペーン数: ${campaigns.length}`);
  for (const c of campaigns) {
    console.log(
      `  - ${c.id} 送信=${c.sentAt.toISOString()} 期限=${c.responseDeadlineAt.toISOString()} トークン=${c._count.tokens}`
    );
  }

  const latest = campaigns[0]!;
  const tokens = await prisma.competitionEntryPaymentIntentToken.findMany({
    where: { campaignId: latest.id },
    include: {
      entry: {
        select: {
          id: true,
          status: true,
          totalFee: true,
          createdAt: true,
          organizerPostPayApprovedAt: true,
          organizerManualPaidAt: true,
          clubIndividualFeePaidAt: true,
          checkoutSessions: {
            orderBy: { createdAt: "desc" },
            select: { status: true, createdAt: true },
          },
          user: {
            select: {
              email: true,
              profile: { select: { familyName: true, givenName: true } },
            },
          },
          participantStatuses: {
            where: { participantType: "INDIVIDUAL", teamEntryId: null },
            select: { eventId: true, status: true, reason: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const ui = {
    totalTokens: tokens.length,
    participateCount: tokens.filter((t) => t.choice === "PARTICIPATE").length,
    withdrawCount: tokens.filter((t) => t.choice === "WITHDRAW").length,
    pendingCount: tokens.filter((t) => !t.respondedAt && !t.deadlineDnsAppliedAt).length,
    deadlineDnsCount: tokens.filter((t) => t.deadlineDnsAppliedAt != null).length,
    overlapParticipateAndDns: tokens.filter(
      (t) => t.choice === "PARTICIPATE" && t.deadlineDnsAppliedAt != null
    ).length,
    sumCategories:
      tokens.filter((t) => t.choice === "PARTICIPATE").length +
      tokens.filter((t) => t.choice === "WITHDRAW").length +
      tokens.filter((t) => !t.respondedAt && !t.deadlineDnsAppliedAt).length +
      tokens.filter((t) => t.deadlineDnsAppliedAt != null).length,
  };

  console.log("\n--- 管理画面と同じ集計（直近キャンペーン）---");
  console.log(JSON.stringify(ui, null, 2));
  if (ui.sumCategories !== ui.totalTokens) {
    console.log(
      `※ 出場+棄権+未回答+期限欠場 = ${ui.sumCategories}（全 ${ui.totalTokens} 件と不一致＝カテゴリ重複あり）`
    );
  }

  const now = new Date();
  const deadlinePassed = now > latest.responseDeadlineAt;
  console.log(
    `\n回答期限: ${latest.responseDeadlineAt.toLocaleString("ja-JP")} （${deadlinePassed ? "経過済み" : "未到来"}）`
  );

  type Row = {
    entryId: string;
    totalFee: number;
    name: string;
    email: string | null;
    tokenChoice: string | null;
    respondedAt: string | null;
    deadlineDnsAppliedAt: string | null;
    entryStatus: string;
    established: boolean;
    feeSettled: boolean;
    postPay: boolean;
    checkoutLatest: string | null;
    checkoutPaid: boolean;
    dnsRows: number;
    dnsReasonSample: string | null;
    uiBucket: string;
    mismatch: string | null;
    settleReason: string | null;
  };

  const rows: Row[] = tokens.map((t) => {
    const e = t.entry;
    const like = entryLike(e);
    const established = isEntryEstablished(like);
    const feeSettled = isEntryFeeSettled(like);
    const postPay = e.organizerPostPayApprovedAt != null;
    const checkoutLatest = e.checkoutSessions[0]?.status ?? null;
    const checkoutPaid = e.checkoutSessions.some((s) =>
      ["COMPLETED", "DISPUTED"].includes(s.status)
    );
    const dnsRows = e.participantStatuses.filter((p) => p.status === "DNS").length;
    const dnsReason = e.participantStatuses.find((p) => p.status === "DNS")?.reason ?? null;

    let uiBucket = "未回答";
    if (t.choice === "PARTICIPATE") uiBucket = "出場";
    else if (t.choice === "WITHDRAW") uiBucket = "棄権";
    else if (t.deadlineDnsAppliedAt) uiBucket = "期限欠場(フラグ)";
    else if (!t.respondedAt) uiBucket = "未回答";

    const settleReason = !feeSettled
      ? null
      : e.totalFee <= 0
        ? "free"
        : e.clubIndividualFeePaidAt
          ? "clubIndividual"
          : e.organizerManualPaidAt
            ? "manual"
            : checkoutPaid
              ? "checkout"
              : "other";

    let mismatch: string | null = null;
    if (!t.respondedAt && !t.deadlineDnsAppliedAt) {
      if (e.status === "CANCELLED") mismatch = "未回答表示だがエントリー取消済み";
      else if (feeSettled && e.totalFee <= 0)
        mismatch = "未回答表示だが参加費0円（決済不要扱い）";
      else if (feeSettled) mismatch = "未回答表示だが参加費決済済み";
      else if (postPay) mismatch = "未回答表示だが後払い承認済み（出場意思は反映済みの可能性）";
    }
    if (t.choice === "PARTICIPATE" && !postPay && !feeSettled && e.status === "SUBMITTED") {
      mismatch = "出場回答だが後払い未承認・未決済";
    }
    if (t.deadlineDnsAppliedAt && dnsRows === 0 && e.status === "SUBMITTED" && !feeSettled) {
      mismatch = "期限処理フラグありだがDNS行なし";
    }

    return {
      entryId: e.id,
      totalFee: e.totalFee,
      name: fullName(e.user.profile),
      email: e.user.email,
      tokenChoice: t.choice,
      respondedAt: t.respondedAt?.toISOString() ?? null,
      deadlineDnsAppliedAt: t.deadlineDnsAppliedAt?.toISOString() ?? null,
      entryStatus: e.status,
      established,
      feeSettled,
      postPay,
      checkoutLatest,
      checkoutPaid,
      dnsRows,
      dnsReasonSample: dnsReason,
      uiBucket,
      mismatch,
      settleReason,
    };
  });

  const mismatches = rows.filter((r) => r.mismatch);
  console.log(`\n--- 画面サマリーと実態のズレ (${mismatches.length} 件) ---`);
  if (mismatches.length > 0) {
    console.table(
      mismatches.map((r) => ({
        name: r.name,
        uiBucket: r.uiBucket,
        mismatch: r.mismatch,
        entryStatus: r.entryStatus,
        feeSettled: r.feeSettled,
        postPay: r.postPay,
        checkoutLatest: r.checkoutLatest,
        paidSession: r.checkoutPaid,
        dns: r.dnsRows,
      }))
    );
  } else {
    console.log("（検出ルール上の明確なズレはなし）");
  }

  const pendingButMoved = rows.filter(
    (r) =>
      r.uiBucket === "未回答" &&
      (r.feeSettled || r.postPay || r.entryStatus === "CANCELLED")
  );
  console.log(`\n--- 「未回答」だが業務上は動いている (${pendingButMoved.length} 件) ---`);
  if (pendingButMoved.length > 0) {
    console.table(
      pendingButMoved.map((r) => ({
        name: r.name,
        email: r.email,
        entryStatus: r.entryStatus,
        feeSettled: r.feeSettled,
        postPay: r.postPay,
        checkoutLatest: r.checkoutLatest,
        paidSession: r.checkoutPaid,
      }))
    );
  }

  const actualDns = rows.filter((r) => r.dnsRows > 0);
  console.log(`\n--- 実際にDNSが付いている (${actualDns.length} 件) ---`);
  console.log(`期限処理フラグ付きトークン: ${ui.deadlineDnsCount} 件`);

  const audits = await prisma.auditLog.findMany({
    where: {
      action: "COMPETITION_UNPAID_INTENT_BULK_SENT",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, meta: true, target: true },
  });
  const relevant = audits.filter((a) => {
    const meta = a.meta as Record<string, unknown> | null;
    return meta?.competitionId === comp.id;
  });
  console.log(`\n--- 一括送信監査ログ（この大会） ${relevant.length} 件 ---`);
  for (const a of relevant.slice(0, 3)) {
    console.log(a.createdAt.toISOString(), JSON.stringify(a.meta));
  }

  const unpaidNow = await prisma.competitionEntry.findMany({
    where: { competitionId: comp.id, status: { not: "CANCELLED" }, totalFee: { gt: 0 } },
    select: {
      id: true,
      status: true,
      totalFee: true,
      organizerPostPayApprovedAt: true,
      organizerManualPaidAt: true,
      clubIndividualFeePaidAt: true,
      checkoutSessions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });
  const unpaidAttempts = unpaidNow.filter((e) => !isEntryEstablished(entryLike(e)));
  const postPayPending = unpaidNow.filter(
    (e) =>
      isEntryEstablished(entryLike(e)) &&
      e.organizerPostPayApprovedAt &&
      !isEntryFeeSettled(entryLike(e))
  );
  const tokenEntryIds = new Set(tokens.map((t) => t.entryId));

  console.log("\n--- 現在のエントリー状況（参考）---");
  console.log(`キャンペーン対象トークン: ${tokens.length}`);
  console.log(`現在未決済試行（画面の未決済リスト相当）: ${unpaidAttempts.length}`);
  console.log(`現在後払い承認済み・入金待ち: ${postPayPending.length}`);
  const tokenlessUnpaid = unpaidAttempts.filter((e) => !tokenEntryIds.has(e.id));
  console.log(`トークンなしの未決済試行: ${tokenlessUnpaid.length}`);
  if (tokenlessUnpaid.length > 0) {
    const details = await prisma.competitionEntry.findMany({
      where: { id: { in: tokenlessUnpaid.map((e) => e.id) } },
      select: {
        user: { select: { email: true, profile: { select: { familyName: true, givenName: true } } } },
        totalFee: true,
      },
    });
    console.table(
      details.map((d) => ({
        name: fullName(d.user.profile),
        email: d.user.email,
        totalFee: d.totalFee,
      }))
    );
  }
  console.log(
    `トークンあり・未回答だが後払い/決済済み: ${rows.filter((r) => r.uiBucket === "未回答" && (r.postPay || r.feeSettled)).length}`
  );

  console.log("\n--- 全トークン一覧 ---");
  console.table(
    rows.map((r) => ({
      name: r.name,
      totalFee: r.totalFee,
      ui: r.uiBucket,
      choice: r.tokenChoice,
      feeSettled: r.feeSettled,
      postPay: r.postPay,
      latestCheckout: r.checkoutLatest,
      hasPaidCheckout: r.checkoutPaid,
      dns: r.dnsRows,
      settleReason: r.settleReason,
    }))
  );

  const trulyUnpaidNoResponse = rows.filter(
    (r) => !r.respondedAt && !r.deadlineDnsAppliedAt && !r.feeSettled && !r.postPay && r.entryStatus !== "CANCELLED"
  );
  console.log(`\n--- 本当に未回答かつ未決済 (${trulyUnpaidNoResponse.length} 件) ---`);
  console.table(
    trulyUnpaidNoResponse.map((r) => ({ name: r.name, email: r.email, latestCheckout: r.checkoutLatest }))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
