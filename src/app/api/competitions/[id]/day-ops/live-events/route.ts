import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest } from "next/server";
import { assertDayOpsRecorderWriteAccess } from "@/lib/dayOpsAccess";
import { computeDayOpsLiveFingerprint } from "@/lib/dayOpsLiveFingerprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const POLL_MS = 4_000;

/**
 * 当日運用の変化を SSE で通知（DB をソースオブトゥルースとした fingerprint ポーリング）。
 * クライアントは `NEXT_PUBLIC_DAY_OPS_LIVE_STREAM=1` のとき EventSource で購読する。
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    try {
      await assertDayOpsRecorderWriteAccess(competitionId, request);
    } catch (e) {
      if (e instanceof Error && e.message === "DAY_OPS_FORBIDDEN") {
        return new Response("Forbidden", { status: 403 });
      }
      if (e instanceof Error && e.message === "DAY_OPS_UNAUTHORIZED") {
        return new Response("Unauthorized", { status: 401 });
      }
      throw e;
    }

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return new Response("eventId required", { status: 400 });
    }

    const encoder = new TextEncoder();
    let lastFingerprint = "";
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        send({ type: "hello", pollMs: POLL_MS });

        const tick = async () => {
          try {
            const fp = await computeDayOpsLiveFingerprint(competitionId, eventId);
            if (fp !== lastFingerprint) {
              lastFingerprint = fp;
              send({ type: "changes", fingerprint: fp });
            } else {
              send({ type: "ping" });
            }
          } catch {
            send({ type: "error", message: "fingerprint_failed" });
          }
        };

        await tick();
        pollInterval = setInterval(() => {
          void tick();
        }, POLL_MS);

        request.signal.addEventListener("abort", () => {
          if (pollInterval) clearInterval(pollInterval);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
      cancel() {
        if (pollInterval) clearInterval(pollInterval);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return jsonInternalError500(
      "GET api/competitions/[id]/day-ops/live-events/route.ts",
      error
    );
  }
}
