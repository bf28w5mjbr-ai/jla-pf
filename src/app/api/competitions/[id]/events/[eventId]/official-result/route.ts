import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { requireOrgAdmin } from "@/lib/accessControl";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import { tryAutoAppendNextStartListRound } from "@/lib/startListNextRoundFromOfficial";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const rowSchema = z.object({
  entryType: z.enum(["INDIVIDUAL", "TEAM"]),
  competitionEntryId: z.string().nullable().optional(),
  teamEntryId: z.string().nullable().optional(),
  rank: z.number().int().nullable().optional(),
  status: z.enum(["OK", "DNS", "DNF", "DSQ"]).optional(),
  resultValue: z.number().int().nullable().optional(),
  unit: z.enum(["TIME_MS", "DISTANCE_CM", "POINTS", "OTHER"]).optional(),
  resultText: z.string().nullable().optional(),
  penaltyValue: z.number().int().nullable().optional(),
  remarks: z.string().nullable().optional(),
  lane: z.number().int().nullable().optional(),
  heat: z.number().int().nullable().optional(),
});

const resultSchema = z.object({
  round: z.enum(["FINAL", "HEAT", "SEMI"]).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  lockedAt: z.string().datetime().nullable().optional(),
  note: z.string().nullable().optional(),
  rows: z.array(rowSchema),
});

function isValidEntryRow(row: z.infer<typeof rowSchema>) {
  if (row.entryType === "INDIVIDUAL") {
    return Boolean(row.competitionEntryId) && !row.teamEntryId;
  }
  return Boolean(row.teamEntryId) && !row.competitionEntryId;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await params;
    const roundParam = req.nextUrl.searchParams.get("round");
    const roundFilter =
      roundParam === "HEAT" || roundParam === "SEMI" || roundParam === "FINAL"
        ? roundParam
        : null;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { organizationId: true },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    let canViewUnpublished = false;
    if (session?.userId) {
      try {
        await requireOrgAdmin(competition.organizationId, session.userId);
        canViewUnpublished = true;
      } catch {
        canViewUnpublished = false;
      }
    }

    const results = await prisma.officialResult.findMany({
      where: {
        competitionId,
        eventId,
        ...(roundFilter ? { round: roundFilter } : {}),
        ...(canViewUnpublished ? {} : { publishedAt: { not: null } }),
      },
      include: {
        rows: {
          select: {
            id: true,
            entryType: true,
            competitionEntryId: true,
            teamEntryId: true,
            rank: true,
            status: true,
            resultValue: true,
            unit: true,
            resultText: true,
            penaltyValue: true,
            remarks: true,
            lane: true,
            heat: true,
          },
        },
      },
      orderBy: { round: "asc" },
    });

    return NextResponse.json({ results });
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/events/[eventId]/official-result/route.ts", error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: competitionId, eventId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { organizationId: true },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    try {
      await requireOrgAdmin(competition.organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const payload = resultSchema.parse(await req.json());
    const round = payload.round ?? "FINAL";

    for (const row of payload.rows) {
      if (!isValidEntryRow(row)) {
        return NextResponse.json({ error: "entryTypeとIDの指定が不正です" }, { status: 400 });
      }
    }

    const individualEntryIds = Array.from(
      new Set(
        payload.rows
          .filter((row) => row.entryType === "INDIVIDUAL" && row.competitionEntryId)
          .map((row) => row.competitionEntryId as string)
      )
    );
    const teamEntryIds = Array.from(
      new Set(
        payload.rows
          .filter((row) => row.entryType === "TEAM" && row.teamEntryId)
          .map((row) => row.teamEntryId as string)
      )
    );

    if (individualEntryIds.length > 0) {
      const validIndividualEntries = await prisma.competitionEntry.findMany({
        where: {
          id: { in: individualEntryIds },
          competitionId,
          items: {
            some: {
              eventId,
            },
          },
        },
        select: { id: true },
      });
      if (validIndividualEntries.length !== individualEntryIds.length) {
        return NextResponse.json(
          { error: "個人結果の対象エントリーが大会または種目に一致しません" },
          { status: 400 }
        );
      }
    }

    if (teamEntryIds.length > 0) {
      const validTeamEntries = await prisma.teamEntry.findMany({
        where: {
          id: { in: teamEntryIds },
          competitionId,
          eventId,
        },
        select: { id: true },
      });
      if (validTeamEntries.length !== teamEntryIds.length) {
        return NextResponse.json(
          { error: "チーム結果の対象エントリーが大会または種目に一致しません" },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.officialResult.findUnique({
      where: {
        competitionId_eventId_round: {
          competitionId,
          eventId,
          round,
        },
      },
      select: { id: true, lockedAt: true },
    });

    if (existing?.lockedAt) {
      return NextResponse.json({ error: "結果が確定済みのため更新できません" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const officialResult = await tx.officialResult.upsert({
        where: {
          competitionId_eventId_round: {
            competitionId,
            eventId,
            round,
          },
        },
        create: {
          competitionId,
          eventId,
          round,
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null,
          lockedAt: payload.lockedAt ? new Date(payload.lockedAt) : null,
          note: payload.note ?? null,
        },
        update: {
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null,
          lockedAt: payload.lockedAt ? new Date(payload.lockedAt) : null,
          note: payload.note ?? null,
        },
      });

      await tx.officialResultRow.deleteMany({
        where: { officialResultId: officialResult.id },
      });
      /** 当日運用のヒート単位確定は行の全置換で無効になるためクリアする */
      await tx.officialResultHeatConfirmed.deleteMany({
        where: { officialResultId: officialResult.id },
      });

      if (payload.rows.length > 0) {
        await tx.officialResultRow.createMany({
          data: payload.rows.map((row) => ({
            officialResultId: officialResult.id,
            entryType: row.entryType,
            competitionEntryId: row.competitionEntryId ?? null,
            teamEntryId: row.teamEntryId ?? null,
            rank: row.rank ?? null,
            status: row.status ?? "OK",
            resultValue: row.resultValue ?? null,
            unit: row.unit ?? "TIME_MS",
            resultText: row.resultText ?? null,
            penaltyValue: row.penaltyValue ?? null,
            remarks: row.remarks ?? null,
            lane: row.lane ?? null,
            heat: row.heat ?? null,
          })),
        });
      }

      return tx.officialResult.findUnique({
        where: { id: officialResult.id },
        include: { rows: true },
      });
    });

    const lockedNow = Boolean(result?.lockedAt);

    await logAuditAction({
      action: "COMPETITION_OFFICIAL_RESULT_UPSERT",
      actorType: "USER",
      actorKey: `user:${session.userId}`,
      actorUserId: session.userId,
      targetType: "OfficialResult",
      targetId: result?.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        round,
        rowCount: payload.rows.length,
        publishedAt: payload.publishedAt ?? null,
        lockedAt: payload.lockedAt ?? null,
      },
      request: getRequestContext(req),
      result: "SUCCESS",
    });

    if (lockedNow && (round === "HEAT" || round === "SEMI")) {
      try {
        const append = await tryAutoAppendNextStartListRound({
          competitionId,
          eventId,
          finishedRound: round,
        });
        if (!append.ok) {
          console.warn("start-list auto-append after official-result PUT:", append.error);
        }
      } catch (e) {
        console.error("start-list auto-append after official-result PUT failed:", e);
      }
    }

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error, "validation_error"), { status: 400 });
    }
    return jsonInternalError500(
      "PUT api/competitions/[id]/events/[eventId]/official-result/route.ts",
      error
    );
  }
}