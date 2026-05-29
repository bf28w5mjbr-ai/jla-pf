import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateMessageError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";
import {
  applyHostInviteTeamAdditions,
  assertHostInviteEventCountLimits,
  buildHostInviteSnapshot,
  clubTeamNameBaseFromApprovedClub,
  HostInviteValidationError,
  parseHostInviteBody,
} from "@/lib/hostInviteEntry";
import { syncStartListSnapshotBeforeMarshal } from "@/lib/startListSnapshotOnEntryIncrease";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return NextResponse.json({ message: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON が不正です" }, { status: 400 });
  }

  try {
    await requireHostOrgAdminForCompetition(competitionId, session.userId);
  } catch (e) {
    const gated = hostOrgAdminGateMessageError(e);
    if (gated) {
      return NextResponse.json({ message: gated.message }, { status: gated.status });
    }
    throw e;
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      status: true,
      entryPledgeEnabled: true,
      entryPledgeText: true,
      allowMultipleEventEntries: true,
      maxEventEntriesPerPerson: true,
      events: {
        select: {
          id: true,
          name: true,
          type: true,
          sex: true,
          minAge: true,
          maxAge: true,
          requiresEntryTime: true,
          maxTeamEntriesPerClub: true,
        },
      },
    },
  });

  if (!competition) {
    return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
  }

  if (competition.status === "CANCELLED" || competition.status === "COMPLETED") {
    return NextResponse.json(
      { message: "この大会の状態ではエントリーを追加できません" },
      { status: 400 }
    );
  }

  const eventMap = new Map(competition.events.map((e) => [e.id, e]));

  let payload;
  try {
    payload = parseHostInviteBody(body, eventMap);
  } catch (e) {
    if (e instanceof HostInviteValidationError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    throw e;
  }

  if (payload.mode === "team") {
    const club = await prisma.club.findUnique({
      where: { id: payload.clubId },
      select: { id: true, status: true, abbreviation: true, name: true },
    });
    if (!club || club.status !== "APPROVED") {
      return NextResponse.json({ message: "クラブが見つかりません" }, { status: 404 });
    }

    const clubBase = clubTeamNameBaseFromApprovedClub(club);

    try {
      const result = await prisma.$transaction(async (tx) =>
        applyHostInviteTeamAdditions(tx, {
          competitionId,
          clubId: payload.clubId,
          clubBase,
          additions: payload.additions,
          eventMap,
        })
      );

      await logAuditAction({
        action: "COMPETITION_HOST_INVITE_ENTRY",
        actorType: "USER",
        actorKey: session.userId,
        actorUserId: session.userId,
        targetType: "Club",
        targetId: payload.clubId,
        result: "SUCCESS",
        metadata: {
          competitionId,
          mode: "team",
          clubId: payload.clubId,
          additions: payload.additions,
          createdTeamEntryIds: result.createdTeamEntryIds,
          createdCount: result.createdCount,
          notes: payload.notes,
        },
        request: getRequestContext(request),
      });

      await syncStartListSnapshotBeforeMarshal({
        competitionId,
        candidateEventIds: payload.additions.map((a) => a.eventId),
        createdByUserId: session.userId,
        trigger: "HOST_INVITE",
        request,
      });

      return NextResponse.json({
        message: "チームエントリーを追加しました",
        createdCount: result.createdCount,
      });
    } catch (e) {
      if (e instanceof HostInviteValidationError) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }
      return jsonInternalError500(
        "POST api/competitions/[id]/entries/host-invite/route.ts team",
        e
      );
    }
  }

  if (competition.entryPledgeEnabled && !(competition.entryPledgeText ?? "").trim()) {
    return NextResponse.json(
      { message: "誓約が有効ですが文言が未設定のため、招待エントリーを登録できません" },
      { status: 400 }
    );
  }

  const allowMultiple = competition.allowMultipleEventEntries ?? true;
  const maxPerPerson =
    typeof competition.maxEventEntriesPerPerson === "number" &&
    competition.maxEventEntriesPerPerson > 0
      ? competition.maxEventEntriesPerPerson
      : null;

  const uniqueEventCount = new Set(payload.items.map((i) => i.eventId)).size;

  try {
    assertHostInviteEventCountLimits({
      uniqueEventCount,
      allowMultiple,
      maxPerPerson,
    });
  } catch (e) {
    if (e instanceof HostInviteValidationError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    throw e;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: payload.targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    return NextResponse.json({ message: "ユーザーが見つかりません" }, { status: 404 });
  }

  const entrySnapshot = buildHostInviteSnapshot(payload);

  const pledgeEnabled = competition.entryPledgeEnabled ?? false;
  const pledgeText = (competition.entryPledgeText ?? "").trim();
  const invitePledgeAt = pledgeEnabled && pledgeText ? new Date() : null;
  const invitePledgeSnapshot = pledgeEnabled && pledgeText ? pledgeText : null;

  try {
    const entryId = await prisma.$transaction(async (tx) => {
      const existing = await tx.competitionEntry.findFirst({
        where: {
          competitionId,
          userId: payload.targetUserId,
          status: "SUBMITTED",
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error("ALREADY_ENTERED");
      }

      const entry = await tx.competitionEntry.create({
        data: {
          competitionId,
          userId: payload.targetUserId,
          clubId: null,
          totalFee: 0,
          status: "SUBMITTED",
          pledgeAcceptedAt: invitePledgeAt,
          pledgeTextSnapshot: invitePledgeSnapshot,
          items: {
            create: payload.items.map((item) => ({
              eventId: item.eventId,
              entryTime: item.entryTime,
            })),
          },
        },
      });

      await tx.entrySnapshot.create({
        data: {
          entryId: entry.id,
          data: entrySnapshot,
        },
      });

      return entry.id;
    });

    await logAuditAction({
      action: "COMPETITION_HOST_INVITE_ENTRY",
      actorType: "USER",
      actorKey: session.userId,
      actorUserId: session.userId,
      targetUserId: payload.targetUserId,
      targetType: "CompetitionEntry",
      targetId: entryId,
      result: "SUCCESS",
      metadata: {
        competitionId,
        mode: "individual",
        eventCount: uniqueEventCount,
      },
      request: getRequestContext(request),
    });

    await syncStartListSnapshotBeforeMarshal({
      competitionId,
      candidateEventIds: payload.items.map((item) => item.eventId),
      createdByUserId: session.userId,
      trigger: "HOST_INVITE",
      request,
    });

    return NextResponse.json({
      message: "招待エントリーを登録しました",
      entryId,
    });
  } catch (e) {
    if (e instanceof HostInviteValidationError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    if (e instanceof Error && e.message === "ALREADY_ENTERED") {
      return NextResponse.json(
        {
          message:
            "このユーザーは既にエントリー済みです。種目の追加は公開のエントリー画面から案内するか、一度取消してからやり直してください。",
        },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/entries/host-invite/route.ts individual",
      e
    );
  }
}
