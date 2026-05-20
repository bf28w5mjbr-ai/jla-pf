import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { OrganizerLifecycleError, requireOrgAdmin } from "@/lib/accessControl";
import {
  buildHostOrganizationSnapshot,
  createDraftCompetition,
} from "@/lib/createDraftCompetition";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      name,
      nameKana,
      description,
      category,
      startDate,
      endDate,
      venue,
      venueAddress,
      entryStartDate,
      entryEndDate,
      maxParticipants,
      entryFee,
    } = body;

    if (!organizationId || !name?.trim()) {
      return NextResponse.json(
        { error: "必須項目が入力されていません" },
        { status: 400 }
      );
    }

    try {
      await requireOrgAdmin(organizationId, session.userId, "operational");
    } catch (e) {
      const message =
        e instanceof OrganizerLifecycleError
          ? e.message
          : "大会を作成する権限がありません";
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        nameKana: true,
        abbreviation: true,
      },
    });
    if (!organization) {
      return NextResponse.json({ error: "主催団体が見つかりません" }, { status: 404 });
    }

    const parseDateOrDefault = (value: unknown, fallback: Date) => {
      if (typeof value !== "string" || value.trim().length === 0) {
        return fallback;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    };

    const defaultStartDate = new Date();
    const defaultEndDate = new Date(defaultStartDate);
    defaultEndDate.setDate(defaultEndDate.getDate() + 1);
    const parsedStartDate = parseDateOrDefault(startDate, defaultStartDate);
    const parsedEndDate = parseDateOrDefault(endDate, defaultEndDate);

    const competition = await createDraftCompetition({
      organizationId,
      snapshot: buildHostOrganizationSnapshot(organization),
      name: name.trim(),
      nameKana,
      description,
      category,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      venue: typeof venue === "string" ? venue : "",
      venueAddress,
      entryStartDate: entryStartDate ? new Date(entryStartDate) : null,
      entryEndDate: entryEndDate ? new Date(entryEndDate) : null,
      maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : null,
      entryFee:
        typeof entryFee === "number"
          ? {
              individualEntryFee: entryFee,
              teamEntryFeePerTeam: 0,
            }
          : entryFee && typeof entryFee === "object"
            ? entryFee
            : undefined,
    });

    return NextResponse.json({
      message: "大会を作成しました",
      competition,
    });
  } catch (error) {
    return jsonInternalError500("POST api/competitions/create/route.ts", error);
  }
}
