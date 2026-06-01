import { jsonInternalError500 } from "@/lib/apiInternalError";
import { clubPublicListWhere, clubPublicSelect } from "@/lib/clubPublicFields";
import { prisma } from "@/server/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const club = await prisma.club.findFirst({
      where: { id: clubId, ...clubPublicListWhere },
      select: clubPublicSelect,
    });

    if (!club) {
      return NextResponse.json({ error: "クラブが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ club });
  } catch (error) {
    return jsonInternalError500("GET api/public/clubs/[clubId]/route.ts", error);
  }
}
