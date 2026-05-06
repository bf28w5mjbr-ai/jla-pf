export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import type { CompetitionStripeSettlementAccountType } from "@prisma/client";

const ALLOWED = new Set<CompetitionStripeSettlementAccountType>(["ORGANIZER_CONNECT", "PLATFORM"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const row = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId },
      select: { stripeSettlementAccountType: true },
    });
    if (!row) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ stripeSettlementAccountType: row.stripeSettlementAccountType });
  } catch (error) {
    return jsonInternalError500(
      "GET api/organizations/.../stripe-settlement-settings",
      error
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ orgId: string; competitionId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId } = await context.params;
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      stripeSettlementAccountType?: unknown;
    };

    const raw = body.stripeSettlementAccountType;
    if (typeof raw !== "string" || !ALLOWED.has(raw as CompetitionStripeSettlementAccountType)) {
      return NextResponse.json({ error: "stripeSettlementAccountType が不正です" }, { status: 400 });
    }
    const next = raw as CompetitionStripeSettlementAccountType;

    const existing = await prisma.competition.findFirst({
      where: { id: competitionId, organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    const updated = await prisma.competition.update({
      where: { id: competitionId },
      data: { stripeSettlementAccountType: next },
      select: { stripeSettlementAccountType: true },
    });

    return NextResponse.json({ success: true, competition: updated });
  } catch (error) {
    return jsonInternalError500(
      "PUT api/organizations/.../stripe-settlement-settings",
      error
    );
  }
}
