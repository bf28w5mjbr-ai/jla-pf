import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { logAuditAction, getRequestContext } from "@/lib/auditLog";

type RouteContext = { params: Promise<{ id: string }> };

const HOST_SNAPSHOT_SOURCE = "HOST_INVITE" as const;

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

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const targetUserId = typeof b.userId === "string" ? b.userId.trim() : "";
  const itemsRaw = Array.isArray(b.items) ? b.items : null;
  if (!targetUserId || !itemsRaw || itemsRaw.length === 0) {
    return NextResponse.json(
      { message: "対象ユーザーと種目（1つ以上）を指定してください" },
      { status: 400 }
    );
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
      organization: {
        select: {
          admins: {
            where: { userId: session.userId },
            select: { role: true },
          },
        },
      },
      events: {
        select: {
          id: true,
          name: true,
          type: true,
          sex: true,
          minAge: true,
          maxAge: true,
          requiresEntryTime: true,
        },
      },
    },
  });

  if (!competition) {
    return NextResponse.json({ message: "大会が見つかりません" }, { status: 404 });
  }

  if (!hasOrgAdminAccess(competition.organization.admins)) {
    return NextResponse.json({ message: "権限がありません" }, { status: 403 });
  }

  if (competition.status === "CANCELLED" || competition.status === "COMPLETED") {
    return NextResponse.json(
      { message: "この大会の状態ではエントリーを追加できません" },
      { status: 400 }
    );
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

  const eventMap = new Map(competition.events.map((e) => [e.id, e]));

  type ParsedItem = { eventId: string; entryTime: string | null };
  const parsedItems: ParsedItem[] = [];
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const eventId = typeof r.eventId === "string" ? r.eventId.trim() : "";
    if (!eventId) continue;
    const ev = eventMap.get(eventId);
    if (!ev || ev.type !== "INDIVIDUAL") {
      return NextResponse.json({ message: "個人種目のみ指定できます" }, { status: 400 });
    }
    const entryTime =
      r.entryTime == null ? null : String(r.entryTime).trim() || null;
    if (ev.requiresEntryTime && (!entryTime || !entryTime.length)) {
      return NextResponse.json(
        { message: `「${ev.name}」のエントリータイムが必要です` },
        { status: 400 }
      );
    }
    parsedItems.push({ eventId, entryTime });
  }

  const dedupedByEvent = new Map<string, ParsedItem>();
  for (const item of parsedItems) {
    dedupedByEvent.set(item.eventId, item);
  }
  const parsedItemsUnique = [...dedupedByEvent.values()];

  if (parsedItemsUnique.length === 0) {
    return NextResponse.json({ message: "有効な種目がありません" }, { status: 400 });
  }

  const uniqueEventIds = [...new Set(parsedItemsUnique.map((i) => i.eventId))];
  if (!allowMultiple && uniqueEventIds.length > 1) {
    return NextResponse.json(
      { message: "この大会は1種目のみ選択可能です" },
      { status: 400 }
    );
  }
  if (allowMultiple && maxPerPerson !== null && uniqueEventIds.length > maxPerPerson) {
    return NextResponse.json(
      { message: `この大会は${maxPerPerson}種目まで選択可能です` },
      { status: 400 }
    );
  }

  const notes =
    typeof b.notes === "string" && b.notes.trim().length > 0
      ? b.notes.trim().slice(0, 2000)
      : null;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    return NextResponse.json({ message: "ユーザーが見つかりません" }, { status: 404 });
  }

  const entrySnapshot = {
    notes,
    items: parsedItemsUnique,
    teamEntries: [] as { eventId: string; teamName: string }[],
    clubId: null as string | null,
    registrationSource: HOST_SNAPSHOT_SOURCE,
  };

  const pledgeEnabled = competition.entryPledgeEnabled ?? false;
  const pledgeText = (competition.entryPledgeText ?? "").trim();
  const invitePledgeAt = pledgeEnabled && pledgeText ? new Date() : null;
  const invitePledgeSnapshot = pledgeEnabled && pledgeText ? pledgeText : null;

  try {
    const entryId = await prisma.$transaction(async (tx) => {
      const existing = await tx.competitionEntry.findFirst({
        where: {
          competitionId,
          userId: targetUserId,
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
          userId: targetUserId,
          clubId: null,
          totalFee: 0,
          status: "SUBMITTED",
          pledgeAcceptedAt: invitePledgeAt,
          pledgeTextSnapshot: invitePledgeSnapshot,
          items: {
            create: parsedItemsUnique.map((item) => ({
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
      targetUserId: targetUserId,
      targetType: "CompetitionEntry",
      targetId: entryId,
      result: "SUCCESS",
      metadata: {
        competitionId,
        eventCount: uniqueEventIds.length,
      },
      request: getRequestContext(request),
    });

    return NextResponse.json({
      message: "招待エントリーを登録しました",
      entryId,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_ENTERED") {
      return NextResponse.json(
        { message: "このユーザーは既にエントリー済みです。種目の追加は公開のエントリー画面から案内するか、一度取消してからやり直してください。" },
        { status: 409 }
      );
    }
    return jsonInternalError500(
      "POST api/competitions/[id]/entries/host-invite/route.ts",
      e
    );
  }
}
