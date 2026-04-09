export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { assertDayOpsReadAccess } from "@/lib/dayOpsAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function fetchSnapshot(competitionId: string, eventId?: string | null) {
  const drafts = await prisma.competitionResultDraft.findMany({
    where: {
      competitionId,
      status: "PROVISIONAL",
      ...(eventId ? { eventId } : {}),
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
        },
      },
      rows: true,
    },
    orderBy: [{ eventId: "asc" }, { round: "asc" }],
  });

  return drafts.map((draft) => ({
    id: draft.id,
    eventId: draft.eventId,
    round: draft.round,
    status: draft.status,
    note: draft.note,
    publishedAt: draft.publishedAt,
    updatedAt: draft.updatedAt,
    event: draft.event,
    rows: draft.rows,
  }));
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const eventId = new URL(request.url).searchParams.get("eventId");
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return new Response("認証が必要です", { status: 401 });
  }
  try {
    await assertDayOpsReadAccess(competitionId, session.userId);
  } catch (error) {
    if (error instanceof Error && error.message === "COMPETITION_NOT_FOUND") {
      return new Response("大会が見つかりません", { status: 404 });
    }
    return new Response("権限がありません", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const snapshot = await fetchSnapshot(competitionId, eventId);
        controller.enqueue(
          encoder.encode(`event: draft\n` + `data: ${JSON.stringify({ drafts: snapshot })}\n\n`)
        );
      };

      await send();
      const timer = setInterval(() => {
        void send();
      }, 2000);

      const abort = () => {
        clearInterval(timer);
        controller.close();
      };
      request.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
