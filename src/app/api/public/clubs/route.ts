import { jsonInternalError500 } from "@/lib/apiInternalError";
import { clubPublicListWhere, clubPublicSelect } from "@/lib/clubPublicFields";
import { prisma } from "@/server/db";
import { NextRequest, NextResponse } from "next/server";

const LIST_CAP = 200;

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const where = {
      ...clubPublicListWhere,
      ...(q.length > 0
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { nameKana: { contains: q, mode: "insensitive" as const } },
              { abbreviation: { contains: q, mode: "insensitive" as const } },
              { patrolLocation: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const clubs = await prisma.club.findMany({
      where,
      select: clubPublicSelect,
      orderBy: { name: "asc" },
      take: LIST_CAP,
    });

    return NextResponse.json({ clubs });
  } catch (error) {
    return jsonInternalError500("GET api/public/clubs/route.ts", error);
  }
}
