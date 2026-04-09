import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // APPROVED または JLA_APPROVED のクラブを取得
    const clubs = await prisma.club.findMany({
      where: {
        OR: [
          { status: 'APPROVED' },
          { status: 'JLA_APPROVED' }
        ]
      },
      select: {
        id: true,
        name: true,
        nameKana: true,
        patrolLocation: true,
        status: true,
        logoUrl: true,
        _count: {
          select: {
            memberships: {
              where: {
                status: 'APPROVED'
              }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json({ clubs });
  } catch (error) {
    return jsonInternalError500("GET api/clubs/search/route.ts", error);
  }
}
