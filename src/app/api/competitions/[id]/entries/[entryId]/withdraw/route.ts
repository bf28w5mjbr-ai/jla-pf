import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isCallClosedForEvent } from "@/lib/dayOpsCallWindow";

type RouteContext = {
  params: Promise<{ id: string; entryId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId, entryId } = await context.params;

  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : "棄権（DNS扱い）";

    const entry = await prisma.competitionEntry.findFirst({
      where: {
        id: entryId,
        competitionId,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        competition: {
          select: {
            status: true,
            startListSettings: true,
          },
        },
        items: {
          select: {
            eventId: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ message: "エントリーが見つかりません" }, { status: 404 });
    }
    if (entry.userId !== session.userId) {
      return NextResponse.json({ message: "このエントリーには申請できません" }, { status: 403 });
    }
    if (entry.status !== "SUBMITTED") {
      return NextResponse.json({ message: "このエントリーは申請対象外です" }, { status: 400 });
    }
    if (entry.competition.status === "COMPLETED" || entry.competition.status === "CANCELLED") {
      return NextResponse.json({ message: "大会終了後は棄権申請できません" }, { status: 400 });
    }

    const eventIds = [...new Set(entry.items.map((item) => item.eventId))];
    if (eventIds.length === 0) {
      return NextResponse.json({ message: "申請対象の種目がありません" }, { status: 400 });
    }
    const hasClosedCallEvent = eventIds.some((eventId) =>
      isCallClosedForEvent(entry.competition.startListSettings, eventId)
    );
    if (hasClosedCallEvent) {
      return NextResponse.json(
        { message: "該当レースは召集締切済みのため、本人からの棄権申請はできません" },
        { status: 400 }
      );
    }

    const updatedCount = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const eventId of eventIds) {
        await tx.competitionParticipantStatus.updateMany({
          where: {
            competitionId,
            eventId,
            participantType: "INDIVIDUAL",
            competitionEntryId: entry.id,
            teamEntryId: null,
          },
          data: {
            status: "DNS",
            reason,
            calledAt: null,
            updatedByUserId: session.userId,
          },
        });
        const anyRow = await tx.competitionParticipantStatus.findFirst({
          where: {
            competitionId,
            eventId,
            participantType: "INDIVIDUAL",
            competitionEntryId: entry.id,
            teamEntryId: null,
          },
          select: { id: true },
        });
        if (!anyRow) {
          await tx.competitionParticipantStatus.create({
            data: {
              competitionId,
              eventId,
              participantType: "INDIVIDUAL",
              competitionEntryId: entry.id,
              marshalRound: "HEAT",
              status: "DNS",
              reason,
              calledAt: null,
              updatedByUserId: session.userId,
            },
          });
        }
        count += 1;
      }
      return count;
    });

    return NextResponse.json({
      message: `棄権申請を受け付けました（${updatedCount}種目）`,
      updatedCount,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/entries/[entryId]/withdraw/route.ts", error);
  }
}
