import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { createNotification } from "@/lib/notificationService";
import {
  CSV_EXPORT_APPROVAL_VALID_DAYS,
  CSV_EXPORT_STATUS,
  getCompetitionEntryCsvExportDelegate,
} from "@/lib/competitionEntryCsvExport";
import { isPfAdminRole } from "@/lib/governancePolicy";

type RouteContext = { params: Promise<{ requestId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { requestId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (!isPfAdminRole(me?.role)) {
      return NextResponse.json({ error: "PF管理者のみ操作できます" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | { action?: "approve" | "reject"; rejectReason?: string }
      | null;
    const action = body?.action;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action が不正です" }, { status: 400 });
    }

    const csvDelegate = getCompetitionEntryCsvExportDelegate();
    if (!csvDelegate) {
      return NextResponse.json(
        {
          error:
            "サーバーが古いPrismaクライアントのままです。pnpm prisma generate のあと dev サーバーを再起動してください。",
        },
        { status: 503 }
      );
    }

    const existing = await csvDelegate.findUnique({
      where: { id: requestId },
      include: {
        competition: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "依頼が見つかりません" }, { status: 404 });
    }

    if (existing.status !== CSV_EXPORT_STATUS.PENDING) {
      return NextResponse.json({ error: "すでに処理済みです" }, { status: 409 });
    }

    const now = new Date();
    const orgId = existing.competition.organizationId;
    const competitionId = existing.competition.id;
    const entriesTabUrl = `/organizations/${orgId}/competitions/${competitionId}?tab=entries`;
    const scopeJa =
      existing.scope === "TEAM" ? "チームエントリー" : "個人エントリー";

    if (action === "approve") {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + CSV_EXPORT_APPROVAL_VALID_DAYS);

      await csvDelegate.update({
        where: { id: requestId },
        data: {
          status: CSV_EXPORT_STATUS.APPROVED,
          reviewedByUserId: session.userId,
          reviewedAt: now,
          expiresAt,
          rejectReason: null,
        },
      });

      void createNotification({
        userId: existing.requestedByUserId,
        category: "SYSTEM",
        type: "ENTRY_CSV_EXPORT_APPROVED",
        title: "エントリーCSV出力が承認されました",
        body: `「${existing.competition.name}」の${scopeJa}について、CSVをダウンロードできるようになりました（${CSV_EXPORT_APPROVAL_VALID_DAYS}日間有効）。`,
        relatedId: requestId,
        linkUrl: entriesTabUrl,
      });

      return NextResponse.json({ ok: true });
    }

    const rejectReason =
      typeof body?.rejectReason === "string" ? body.rejectReason.trim().slice(0, 2000) : "";

    await csvDelegate.update({
      where: { id: requestId },
      data: {
        status: CSV_EXPORT_STATUS.REJECTED,
        reviewedByUserId: session.userId,
        reviewedAt: now,
        expiresAt: null,
        rejectReason: rejectReason || null,
      },
    });

    void createNotification({
      userId: existing.requestedByUserId,
      category: "SYSTEM",
      type: "ENTRY_CSV_EXPORT_REJECTED",
      title: "エントリーCSV出力の依頼が却下されました",
      body: `「${existing.competition.name}」の${scopeJa}についての依頼は却下されました。${rejectReason ? ` 理由: ${rejectReason}` : ""}`,
      relatedId: requestId,
      linkUrl: entriesTabUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonInternalError500("PATCH api/admin/entry-csv-export-requests/[requestId]/route.ts", e);
  }
}
