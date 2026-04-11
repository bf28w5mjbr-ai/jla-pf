import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { createNotification } from "@/lib/notificationService";
import {
  CSV_EXPORT_SCOPE,
  CSV_EXPORT_STATUS,
  getActiveCsvExportApproval,
  getCompetitionEntryCsvExportDelegate,
  getPendingCsvExportRequest,
} from "@/lib/competitionEntryCsvExport";
type RouteContext = { params: Promise<{ id: string }> };

const SCOPES = new Set<string>([CSV_EXPORT_SCOPE.INDIVIDUAL, CSV_EXPORT_SCOPE.TEAM]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { scope?: string } | null;
    const scope = body?.scope;
    if (!scope || !SCOPES.has(scope)) {
      return NextResponse.json({ error: "scope が不正です" }, { status: 400 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        organization: {
          select: {
            admins: {
              where: { userId: session.userId },
              select: { role: true },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    if (!hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const active = await getActiveCsvExportApproval(competitionId, scope);
    if (active) {
      return NextResponse.json(
        { error: "既に承認済みです。画面の「CSVダウンロード」から取得できます。" },
        { status: 409 }
      );
    }

    const pending = await getPendingCsvExportRequest(competitionId, scope);
    if (pending) {
      return NextResponse.json(
        { error: "既に承認待ちの依頼があります。PF管理者の対応をお待ちください。" },
        { status: 409 }
      );
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

    const created = await csvDelegate.create({
      data: {
        competitionId,
        scope,
        requestedByUserId: session.userId,
        status: CSV_EXPORT_STATUS.PENDING,
      },
      select: { id: true },
    });

    const pfAdmins = await prisma.user.findMany({
      where: { role: "PF_ADMIN" },
      select: { id: true },
    });

    const scopeJa = scope === CSV_EXPORT_SCOPE.INDIVIDUAL ? "個人エントリー" : "チームエントリー";
    const adminPath = "/admin/account?tab=host";

    for (const u of pfAdmins) {
      void createNotification({
        userId: u.id,
        category: "SYSTEM",
        type: "ENTRY_CSV_EXPORT_REQUESTED",
        title: "エントリーCSV出力の承認依頼",
        body: `「${competition.name}」の${scopeJa}について、CSV出力の承認が求められています。`,
        relatedId: created.id,
        linkUrl: adminPath,
      });
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    return jsonInternalError500("POST api/competitions/[id]/entry-csv-export-requests/route.ts", e);
  }
}
