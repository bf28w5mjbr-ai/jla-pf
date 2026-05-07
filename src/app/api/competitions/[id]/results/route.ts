import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { loadCompetitionOfficialResultsPayloadFromRequest } from "@/lib/competitionOfficialResultsPayload";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: competitionId } = await params;
    const token = req.cookies.get("session")?.value;
    const payload = await loadCompetitionOfficialResultsPayloadFromRequest(competitionId, token);

    if (!payload) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return jsonInternalError500("GET api/competitions/[id]/results/route.ts", error);
  }
}
