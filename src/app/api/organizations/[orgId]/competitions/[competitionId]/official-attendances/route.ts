export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { normalizeNfcTagId } from "@/lib/nfc/normalizeNfcTagId";

type ManualBody = {
  mode: "manual";
  date: string;
  userId: string;
  attended: boolean;
};

type NfcBody = {
  mode: "nfc";
  date: string;
  nfcTagId: string;
};

type PostBody = ManualBody | NfcBody;

function parseDateOnly(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateTabs(startDate: Date, endDate: Date): string[] {
  const start = new Date(`${toDateOnlyString(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toDateOnlyString(endDate)}T00:00:00.000Z`);
  const out: string[] = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    out.push(toDateOnlyString(cursor));
    if (out.length > 62) break;
  }
  return out;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(orgId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const competition = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId: orgId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        officialApplications: {
          where: { status: "APPROVED" },
          select: {
            userId: true,
            positionName: true,
            user: {
              select: {
                familyName: true,
                givenName: true,
                nfcTagId: true,
              },
            },
          },
          orderBy: [{ positionName: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const dateTabs = buildDateTabs(competition.startDate, competition.endDate);
    const url = new URL(request.url);
    const selectedDateRaw = url.searchParams.get("date") ?? dateTabs[0] ?? toDateOnlyString(new Date());
    const selectedDate = parseDateOnly(selectedDateRaw);
    if (!selectedDate) {
      return NextResponse.json({ error: "日付形式が不正です" }, { status: 400 });
    }

    const attendances = await prisma.competitionOfficialAttendance.findMany({
      where: {
        competitionId,
        attendanceDate: selectedDate,
      },
      select: {
        userId: true,
        method: true,
      },
    });
    const attendanceByUserId = new Map(attendances.map((row) => [row.userId, row]));

    const members = competition.officialApplications.map((a) => {
      const attended = attendanceByUserId.get(a.userId);
      return {
        userId: a.userId,
        name: `${a.user.familyName} ${a.user.givenName}`,
        positionName: a.positionName,
        hasNfcTag: Boolean(a.user.nfcTagId),
        attended: Boolean(attended),
        method: attended?.method ?? null,
      };
    });

    return NextResponse.json({
      competitionName: competition.name,
      dateTabs,
      selectedDate: toDateOnlyString(selectedDate),
      members,
      summary: {
        approvedCount: members.length,
        attendedCount: members.filter((m) => m.attended).length,
      },
    });
  } catch (error) {
    return jsonInternalError500(
      "GET api/organizations/[orgId]/competitions/[competitionId]/official-attendances/route.ts",
      error
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(orgId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Partial<PostBody>;
    const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
    const attendanceDate = parseDateOnly(dateRaw);
    if (!attendanceDate) {
      return NextResponse.json({ error: "日付形式が不正です" }, { status: 400 });
    }

    if (body.mode === "manual") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      const attended = Boolean(body.attended);
      if (!userId) {
        return NextResponse.json({ error: "ユーザーが不正です" }, { status: 400 });
      }

      const approved = await prisma.competitionOfficialApplication.findUnique({
        where: { competitionId_userId: { competitionId, userId } },
        select: { status: true },
      });
      if (!approved || approved.status !== "APPROVED") {
        return NextResponse.json({ error: "承認済みオフィシャルのみ操作可能です" }, { status: 400 });
      }

      if (attended) {
        await prisma.competitionOfficialAttendance.upsert({
          where: {
            competitionId_userId_attendanceDate: { competitionId, userId, attendanceDate },
          },
          create: {
            competitionId,
            userId,
            attendanceDate,
            method: "MANUAL",
            recordedByUserId: session.userId,
          },
          update: {
            method: "MANUAL",
            recordedByUserId: session.userId,
          },
        });
      } else {
        await prisma.competitionOfficialAttendance.deleteMany({
          where: { competitionId, userId, attendanceDate },
        });
      }

      return NextResponse.json({ success: true });
    }

    if (body.mode === "nfc") {
      const nfcTagIdRaw = typeof body.nfcTagId === "string" ? body.nfcTagId : "";
      const nfcTagId = normalizeNfcTagId(nfcTagIdRaw);
      if (!nfcTagId) {
        return NextResponse.json({ error: "NFCタグが不正です" }, { status: 400 });
      }

      const user = await prisma.user.findFirst({
        where: { nfcTagId },
        select: { id: true, familyName: true, givenName: true },
      });
      if (!user) {
        return NextResponse.json({ error: "NFCタグに紐づくユーザーが見つかりません" }, { status: 404 });
      }

      const approved = await prisma.competitionOfficialApplication.findUnique({
        where: { competitionId_userId: { competitionId, userId: user.id } },
        select: { status: true },
      });
      if (!approved || approved.status !== "APPROVED") {
        return NextResponse.json({ error: "承認済みオフィシャルではありません" }, { status: 400 });
      }

      await prisma.competitionOfficialAttendance.upsert({
        where: {
          competitionId_userId_attendanceDate: { competitionId, userId: user.id, attendanceDate },
        },
        create: {
          competitionId,
          userId: user.id,
          attendanceDate,
          method: "NFC",
          recordedByUserId: session.userId,
        },
        update: {
          method: "NFC",
          recordedByUserId: session.userId,
        },
      });

      return NextResponse.json({
        success: true,
        scannedUser: { id: user.id, name: `${user.familyName} ${user.givenName}` },
      });
    }

    return NextResponse.json({ error: "mode が不正です" }, { status: 400 });
  } catch (error) {
    return jsonInternalError500(
      "POST api/organizations/[orgId]/competitions/[competitionId]/official-attendances/route.ts",
      error
    );
  }
}
