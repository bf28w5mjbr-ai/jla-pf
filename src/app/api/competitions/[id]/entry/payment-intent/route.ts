import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  findPaymentIntentTokenByRaw,
  formatPaymentIntentPublicState,
  respondToPaymentIntent,
} from "@/lib/entryPaymentIntent";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;
  const rawToken = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!rawToken) {
    return NextResponse.json({ message: "トークンが必要です" }, { status: 400 });
  }

  try {
    const row = await findPaymentIntentTokenByRaw(prisma, competitionId, rawToken);
    if (!row) {
      return NextResponse.json({ message: "リンクが無効です" }, { status: 404 });
    }

    return NextResponse.json(formatPaymentIntentPublicState(row));
  } catch (e) {
    return jsonInternalError500("GET api/competitions/[id]/entry/payment-intent/route.ts", e);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: competitionId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON が不正です" }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawToken = typeof b.token === "string" ? b.token.trim() : "";
  const choice = b.choice === "participate" || b.choice === "withdraw" ? b.choice : null;

  if (!rawToken || !choice) {
    return NextResponse.json(
      { message: "トークンと choice（participate または withdraw）が必要です" },
      { status: 400 }
    );
  }

  try {
    const row = await findPaymentIntentTokenByRaw(prisma, competitionId, rawToken);
    if (!row) {
      return NextResponse.json({ message: "リンクが無効です" }, { status: 404 });
    }

    if (row.respondedAt) {
      return NextResponse.json({ message: "すでに回答済みです" }, { status: 400 });
    }
    if (Date.now() > row.expiresAt.getTime()) {
      return NextResponse.json({ message: "リンクの有効期限が切れています" }, { status: 400 });
    }
    if (row.entry.status === "CANCELLED") {
      return NextResponse.json({ message: "このエントリーは取消済みです" }, { status: 400 });
    }

    const result = await respondToPaymentIntent(prisma, { tokenRow: row, choice });

    return NextResponse.json({
      message:
        choice === "participate"
          ? "出場の意思を受け付けました。ログイン後、エントリー画面からお支払いいただけます。"
          : "棄権を受け付け、エントリーを取消しました。",
      choice: result.choice,
      competitionId,
      entryPath: `/competitions/${competitionId}/entry`,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "ALREADY_RESPONDED") {
        return NextResponse.json({ message: "すでに回答済みです" }, { status: 400 });
      }
      if (e.message === "TOKEN_EXPIRED") {
        return NextResponse.json({ message: "リンクの有効期限が切れています" }, { status: 400 });
      }
    }
    return jsonInternalError500("POST api/competitions/[id]/entry/payment-intent/route.ts", e);
  }
}
