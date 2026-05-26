import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  assertDayOpsAdminWriteAccess,
  assertDayOpsReadAccess,
} from "@/lib/dayOpsAccess";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import type { ResultRound } from "@prisma/client";
import { isCallClosedForEvent } from "@/lib/dayOpsCallWindow";
import { markMarshalStartedIfUnset } from "@/lib/eventHeatPlanMarshal";
import {
  getClosedMarshalHeatIndices,
  isMarshalHeatCallClosed,
  loadStartListSnapshotPayload,
  resolveParticipantMarshalHeat,
} from "@/lib/heatMarshalGate";
import { dayOpsServerTimingEnabled, formatDayOpsServerTiming } from "@/lib/dayOpsMetrics";
import { START_LIST_STEP1_REQUIRED_MESSAGE } from "@/lib/startListStep1Messages";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    await assertDayOpsReadAccess(competitionId, request);

    const searchParams = new URL(request.url).searchParams;
    const eventId = searchParams.get("eventId");
    const includeCandidates = searchParams.get("includeCandidates") !== "0";
    if (!eventId) {
      return NextResponse.json({ error: "eventIdが必要です" }, { status: 400 });
    }

    const wall0 = Date.now();
    const [competition, eventMeta, statuses, individualCandidates, teamCandidates] = await Promise.all([
      prisma.competition.findUnique({
        where: { id: competitionId },
        select: { startListSettings: true },
      }),
      prisma.event.findFirst({
        where: { id: eventId, competitionId },
        select: { startListHeatPlanConfirmedAt: true, marshalStartedAt: true },
      }),
      prisma.competitionParticipantStatus.findMany({
        where: {
          competitionId,
          eventId,
        },
        orderBy: { updatedAt: "desc" },
      }),
      includeCandidates
        ? prisma.competitionEntry.findMany({
            where: {
              competitionId,
              status: "SUBMITTED",
              items: {
                some: { eventId },
              },
            },
            select: {
              id: true,
              userId: true,
              user: {
                select: { profile: { select: { familyName: true, givenName: true } } },
              },
            },
          })
        : Promise.resolve([]),
      includeCandidates
        ? prisma.teamEntry.findMany({
            where: {
              competitionId,
              eventId,
            },
            select: {
              id: true,
              teamName: true,
              members: {
                select: {
                  userId: true,
                  user: { select: { profile: { select: { familyName: true, givenName: true } } } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const wall1 = Date.now();
    const callClosed = isCallClosedForEvent(competition?.startListSettings, eventId);

    const wall2 = Date.now();
    const timingOpt =
      dayOpsServerTimingEnabled() ?
        {
          headers: {
            "Server-Timing": formatDayOpsServerTiming([
              { name: "db", durMs: wall1 - wall0 },
              { name: "build", durMs: wall2 - wall1 },
            ]),
          },
        }
      : {};

    return NextResponse.json({
      statuses,
      callClosed,
      heatPlanConfirmed: Boolean(eventMeta?.startListHeatPlanConfirmedAt),
      marshalStarted: Boolean(eventMeta?.marshalStartedAt),
      candidates: {
        individuals: individualCandidates.map((entry) => ({
          participantType: "INDIVIDUAL" as const,
          competitionEntryId: entry.id,
          userId: entry.userId,
          label: `${entry.user.profile?.familyName ?? ""} ${entry.user.profile?.givenName ?? ""}`.trim(),
        })),
        teams: teamCandidates.map((entry) => ({
          participantType: "TEAM" as const,
          teamEntryId: entry.id,
          label: entry.teamName,
          memberUsers: entry.members.map((m) => ({
            userId: m.userId,
            label: `${entry.teamName} / ${`${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim()}`,
          })),
        })),
      },
    }, timingOpt);
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    return jsonInternalError500(
      "GET api/competitions/[id]/day-ops/participant-statuses/route.ts",
      error
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const dayOpsCtx = await assertDayOpsAdminWriteAccess(competitionId, request);
    const operatorUserId = dayOpsCtx.operatorUserId;

    const body = (await request.json()) as {
      eventId?: unknown;
      participantType?: unknown;
      competitionEntryId?: unknown;
      teamEntryId?: unknown;
      /** チーム種目: 構成員ユーザー（CALLED / PENDING 戻しで必須・メンバー割当済みのとき） */
      teamMemberUserId?: unknown;
      status?: unknown;
      reason?: unknown;
      marshalRound?: unknown;
      /** マーシャル締切前の練習用: CALLED を PENDING に戻す */
      revertMarshalPractice?: unknown;
    };
    const revertMarshalPractice = body.revertMarshalPractice === true;
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const participantType = body.participantType === "TEAM" ? "TEAM" : "INDIVIDUAL";
    const requestedStatus =
      typeof body.status === "string" &&
      ["PENDING", "CALLED", "CHECKED_IN", "DNS", "WITHDRAWN", "DSQ"].includes(body.status)
        ? (body.status as "PENDING" | "CALLED" | "CHECKED_IN" | "DNS" | "WITHDRAWN" | "DSQ")
        : "PENDING";
    if (requestedStatus === "CHECKED_IN") {
      return NextResponse.json(
        { error: "チェックイン運用は廃止されました。CALLED/DNS/DSQをご利用ください" },
        { status: 400 }
      );
    }
    const status = requestedStatus === "WITHDRAWN" ? "DNS" : requestedStatus;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const competitionEntryId =
      participantType === "INDIVIDUAL" && typeof body.competitionEntryId === "string"
        ? body.competitionEntryId
        : null;
    const teamEntryId =
      participantType === "TEAM" && typeof body.teamEntryId === "string" ? body.teamEntryId : null;

    if (!eventId) {
      return NextResponse.json({ error: "eventIdが不正です" }, { status: 400 });
    }
    if (participantType === "INDIVIDUAL" && !competitionEntryId) {
      return NextResponse.json({ error: "competitionEntryIdが必要です" }, { status: 400 });
    }
    if (participantType === "TEAM" && !teamEntryId) {
      return NextResponse.json({ error: "teamEntryIdが必要です" }, { status: 400 });
    }
    const teamMemberUserIdBody =
      participantType === "TEAM"
        ? typeof body.teamMemberUserId === "string"
          ? body.teamMemberUserId
          : body.teamMemberUserId === null
            ? null
            : undefined
        : null;
    if (status === "DSQ" && reason.length === 0) {
      return NextResponse.json({ error: "理由を入力してください" }, { status: 400 });
    }
    const eventRow = await prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: { id: true, startListHeatPlanConfirmedAt: true },
    });
    if (!eventRow) {
      return NextResponse.json({ error: "種目が見つかりません" }, { status: 404 });
    }
    if (!eventRow.startListHeatPlanConfirmedAt) {
      return NextResponse.json(
        { error: START_LIST_STEP1_REQUIRED_MESSAGE },
        { status: 409 }
      );
    }
    const marshalRound: ResultRound =
      typeof body.marshalRound === "string" &&
      ["HEAT", "SEMI", "FINAL"].includes(body.marshalRound)
        ? (body.marshalRound as ResultRound)
        : "HEAT";

    if (
      participantType === "TEAM" &&
      teamEntryId &&
      status !== "DNS" &&
      status !== "DSQ"
    ) {
      const memberCount = await prisma.teamEntryMember.count({
        where: { teamEntryId },
      });
      if (memberCount > 0 && teamMemberUserIdBody === undefined) {
        return NextResponse.json(
          { error: "チーム種目（構成員割当済み）では teamMemberUserId が必要です" },
          { status: 400 }
        );
      }
    }

    if (status === "CALLED") {
      const [snapshot, closedHeats] = await Promise.all([
        loadStartListSnapshotPayload(competitionId),
        getClosedMarshalHeatIndices(prisma, competitionId, eventId, marshalRound),
      ]);
      const heatIndex = resolveParticipantMarshalHeat(snapshot, eventId, marshalRound, {
        participantType,
        competitionEntryId,
        teamEntryId,
        teamMemberUserId: teamMemberUserIdBody ?? null,
      });
      if (isMarshalHeatCallClosed(closedHeats, heatIndex)) {
        return NextResponse.json(
          {
            error: `このラウンドのヒート${heatIndex}は召集締切済みのためCALLEDにできません`,
          },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    const participantWhere = {
      competitionId,
      eventId,
      participantType,
      competitionEntryId: competitionEntryId ?? null,
      teamEntryId: teamEntryId ?? null,
    } as const;
    const participantWhereScoped = {
      ...participantWhere,
      ...(participantType === "TEAM" ? { teamMemberUserId: teamMemberUserIdBody ?? null } : {}),
    } as const;

    const allMarshalRounds: ResultRound[] = ["HEAT", "SEMI", "FINAL"];

    const upserted = await prisma.$transaction(async (tx) => {
      const reasonResolved =
        status === "DNS" && requestedStatus === "WITHDRAWN"
          ? reason || "棄権（DNS扱い）"
          : reason || null;

      /** 棄権・欠場は種目全体で同一状態にそろえる（全 marshalRound 行） */
      if (status === "DNS") {
        if (participantType === "TEAM" && teamEntryId) {
          const members = await tx.teamEntryMember.findMany({
            where: { teamEntryId },
            select: { userId: true },
          });
          if (members.length > 0) {
            const memberUserIds = members.map(({ userId }) => userId);
            const allRows = allMarshalRounds.flatMap((mr) =>
              memberUserIds.map((userId) => ({
                competitionId,
                eventId,
                participantType: "TEAM" as const,
                competitionEntryId: null,
                teamEntryId,
                teamMemberUserId: userId,
                marshalRound: mr,
                status: "DNS" as const,
                reason: reasonResolved,
                calledAt: null,
                updatedByUserId: operatorUserId,
              }))
            );
            await tx.competitionParticipantStatus.createMany({
              data: allRows,
              skipDuplicates: true,
            });
            await tx.competitionParticipantStatus.updateMany({
              where: {
                competitionId,
                eventId,
                participantType: "TEAM",
                competitionEntryId: null,
                teamEntryId,
                teamMemberUserId: { in: memberUserIds },
                marshalRound: { in: allMarshalRounds },
              },
              data: {
                status: "DNS",
                reason: reasonResolved,
                calledAt: null,
                updatedByUserId: operatorUserId,
              },
            });
            const row = await tx.competitionParticipantStatus.findFirst({
              where: {
                competitionId,
                eventId,
                participantType: "TEAM",
                teamEntryId,
                teamMemberUserId: memberUserIds[0],
              },
              orderBy: { updatedAt: "desc" },
            });
            await markMarshalStartedIfUnset(tx.event, eventId, now);
            return row!;
          }
          await tx.competitionParticipantStatus.updateMany({
            where: {
              competitionId,
              eventId,
              participantType: "TEAM",
              competitionEntryId: null,
              teamEntryId,
              teamMemberUserId: null,
            },
            data: {
              status: "DNS",
              reason: reasonResolved,
              calledAt: null,
              updatedByUserId: operatorUserId,
            },
          });
          let row = await tx.competitionParticipantStatus.findFirst({
            where: {
              competitionId,
              eventId,
              participantType: "TEAM",
              competitionEntryId: null,
              teamEntryId,
              teamMemberUserId: null,
            },
            orderBy: { updatedAt: "desc" },
          });
          if (!row) {
            row = await tx.competitionParticipantStatus.create({
              data: {
                competitionId,
                eventId,
                participantType: "TEAM",
                competitionEntryId: null,
                teamEntryId,
                teamMemberUserId: null,
                marshalRound: "HEAT",
                status: "DNS",
                reason: reasonResolved,
                calledAt: null,
                updatedByUserId: operatorUserId,
              },
            });
          }
          await markMarshalStartedIfUnset(tx.event, eventId, now);
          return row;
        }
        await tx.competitionParticipantStatus.updateMany({
          where: participantWhere,
          data: {
            status: "DNS",
            reason: reasonResolved,
            calledAt: null,
            updatedByUserId: operatorUserId,
          },
        });
        let row = await tx.competitionParticipantStatus.findFirst({
          where: participantWhere,
          orderBy: { updatedAt: "desc" },
        });
        if (!row) {
          row = await tx.competitionParticipantStatus.create({
            data: {
              ...participantWhere,
              teamMemberUserId: null,
              marshalRound: "HEAT",
              status: "DNS",
              reason: reasonResolved,
              calledAt: null,
              updatedByUserId: operatorUserId,
            },
          });
        }
        await markMarshalStartedIfUnset(tx.event, eventId, now);
        return row;
      }

      /** 失格も種目全体で統一 */
      if (status === "DSQ") {
        if (participantType === "TEAM" && teamEntryId) {
          const members = await tx.teamEntryMember.findMany({
            where: { teamEntryId },
            select: { userId: true },
          });
          if (members.length > 0) {
            const memberUserIds = members.map(({ userId }) => userId);
            const allRows = allMarshalRounds.flatMap((mr) =>
              memberUserIds.map((userId) => ({
                competitionId,
                eventId,
                participantType: "TEAM" as const,
                competitionEntryId: null,
                teamEntryId,
                teamMemberUserId: userId,
                marshalRound: mr,
                status: "DSQ" as const,
                reason: reason || null,
                calledAt: null,
                updatedByUserId: operatorUserId,
              }))
            );
            await tx.competitionParticipantStatus.createMany({
              data: allRows,
              skipDuplicates: true,
            });
            await tx.competitionParticipantStatus.updateMany({
              where: {
                competitionId,
                eventId,
                participantType: "TEAM",
                competitionEntryId: null,
                teamEntryId,
                teamMemberUserId: { in: memberUserIds },
                marshalRound: { in: allMarshalRounds },
              },
              data: {
                status: "DSQ",
                reason: reason || null,
                calledAt: null,
                updatedByUserId: operatorUserId,
              },
            });
            const row = await tx.competitionParticipantStatus.findFirst({
              where: {
                competitionId,
                eventId,
                participantType: "TEAM",
                teamEntryId,
                teamMemberUserId: memberUserIds[0],
              },
              orderBy: { updatedAt: "desc" },
            });
            await markMarshalStartedIfUnset(tx.event, eventId, now);
            return row!;
          }
          await tx.competitionParticipantStatus.updateMany({
            where: {
              competitionId,
              eventId,
              participantType: "TEAM",
              competitionEntryId: null,
              teamEntryId,
              teamMemberUserId: null,
            },
            data: {
              status: "DSQ",
              reason: reason || null,
              calledAt: null,
              updatedByUserId: operatorUserId,
            },
          });
          let row = await tx.competitionParticipantStatus.findFirst({
            where: {
              competitionId,
              eventId,
              participantType: "TEAM",
              competitionEntryId: null,
              teamEntryId,
              teamMemberUserId: null,
            },
            orderBy: { updatedAt: "desc" },
          });
          if (!row) {
            row = await tx.competitionParticipantStatus.create({
              data: {
                competitionId,
                eventId,
                participantType: "TEAM",
                competitionEntryId: null,
                teamEntryId,
                teamMemberUserId: null,
                marshalRound: "HEAT",
                status: "DSQ",
                reason: reason || null,
                calledAt: null,
                updatedByUserId: operatorUserId,
              },
            });
          }
          await markMarshalStartedIfUnset(tx.event, eventId, now);
          return row;
        }
        await tx.competitionParticipantStatus.updateMany({
          where: participantWhere,
          data: {
            status: "DSQ",
            reason: reason || null,
            calledAt: null,
            updatedByUserId: operatorUserId,
          },
        });
        let row = await tx.competitionParticipantStatus.findFirst({
          where: participantWhere,
          orderBy: { updatedAt: "desc" },
        });
        if (!row) {
          row = await tx.competitionParticipantStatus.create({
            data: {
              ...participantWhere,
              teamMemberUserId: null,
              marshalRound: "HEAT",
              status: "DSQ",
              reason: reason || null,
              calledAt: null,
              updatedByUserId: operatorUserId,
            },
          });
        }
        await markMarshalStartedIfUnset(tx.event, eventId, now);
        return row;
      }

      const terminalAny = await tx.competitionParticipantStatus.findFirst({
        where: {
          ...participantWhereScoped,
          status: { in: ["DNS", "WITHDRAWN", "DSQ"] },
        },
        select: { id: true, status: true },
      });

      const existingRound = await tx.competitionParticipantStatus.findFirst({
        where: {
          ...participantWhereScoped,
          marshalRound,
        },
        select: { id: true, status: true },
      });

      const currentStatus = terminalAny?.status ?? existingRound?.status ?? "PENDING";
      const isTerminal =
        currentStatus === "DNS" || currentStatus === "WITHDRAWN" || currentStatus === "DSQ";
      if (isTerminal) {
        throw new Error(
          `PARTICIPANT_STATUS_TERMINAL\n現在の状態(${currentStatus})からは変更できません`
        );
      }
      if (currentStatus === "CALLED" && status === "PENDING") {
        if (!revertMarshalPractice) {
          throw new Error("PARTICIPANT_CALLED_REVERT");
        }
        const snapshot = await loadStartListSnapshotPayload(competitionId);
        const closedHeats = await getClosedMarshalHeatIndices(
          tx,
          competitionId,
          eventId,
          marshalRound
        );
        const heatIndex = resolveParticipantMarshalHeat(snapshot, eventId, marshalRound, {
          participantType,
          competitionEntryId,
          teamEntryId,
          teamMemberUserId: teamMemberUserIdBody ?? null,
        });
        if (heatIndex == null) {
          throw new Error("MARSHAL_REVERT_NO_HEAT");
        }
        if (isMarshalHeatCallClosed(closedHeats, heatIndex)) {
          throw new Error("MARSHAL_HEAT_CLOSED_REVERT");
        }
      }

      const row = existingRound
        ? await tx.competitionParticipantStatus.update({
            where: { id: existingRound.id },
            data: {
              status,
              reason: reasonResolved,
              calledAt: status === "CALLED" ? now : null,
              updatedByUserId: operatorUserId,
            },
          })
        : await tx.competitionParticipantStatus.create({
            data: {
              competitionId,
              eventId,
              participantType,
              competitionEntryId,
              teamEntryId,
              teamMemberUserId: participantType === "TEAM" ? teamMemberUserIdBody ?? null : null,
              marshalRound,
              status,
              reason: reasonResolved,
              calledAt: status === "CALLED" ? now : null,
              updatedByUserId: operatorUserId,
            },
          });

      if (status !== "PENDING") {
        await markMarshalStartedIfUnset(tx.event, eventId, now);
      }
      return row;
    });

    await logAuditAction({
      action: "COMPETITION_PARTICIPANT_STATUS_UPSERT",
      actorType: operatorUserId ? "USER" : "SYSTEM",
      actorKey: operatorUserId ? `user:${operatorUserId}` : "dayops:unlock",
      actorUserId: operatorUserId ?? undefined,
      targetType: "CompetitionParticipantStatus",
      targetId: upserted.id,
      targetKey: `competition:${competitionId}`,
      metadata: {
        competitionId,
        eventId,
        participantType,
        competitionEntryId,
        teamEntryId,
        teamMemberUserId: participantType === "TEAM" ? teamMemberUserIdBody ?? null : undefined,
        status,
        marshalRound: status === "CALLED" ? marshalRound : undefined,
        reason:
          status === "DNS" && requestedStatus === "WITHDRAWN"
            ? reason || "棄権（DNS扱い）"
            : reason || null,
        requestedStatus,
      },
      request: getRequestContext(request),
      result: "SUCCESS",
    });

    return NextResponse.json({ status: upserted });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_FORBIDDEN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "DAY_OPS_UNAUTHORIZED") {
      return NextResponse.json(
        { error: "ログインするか、大会の当日運用暗号をスタートリスト画面で入力してください" },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith("PARTICIPANT_STATUS_TERMINAL\n")) {
      return NextResponse.json(
        { error: error.message.slice("PARTICIPANT_STATUS_TERMINAL\n".length) },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "PARTICIPANT_CALLED_REVERT") {
      return NextResponse.json(
        { error: "召集済みの状態を未召集へ戻すことはできません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "MARSHAL_HEAT_CLOSED_REVERT") {
      return NextResponse.json(
        { error: "このヒートはマーシャル締切済みのため、召集済みを取り消せません" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "MARSHAL_REVERT_NO_HEAT") {
      return NextResponse.json(
        { error: "スタートリスト上でヒートを特定できないため取り消せません" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/day-ops/participant-statuses/route.ts",
      error
    );
  }
}
