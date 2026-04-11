import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../lib/auth";
import { prisma } from "../../../server/db";
import { z } from "zod";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const licenseCreateSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

/**
 * 協会ライセンスAPI
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const user = await requireAuth(token);
    if (!user?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const payload = licenseCreateSchema.parse(await request.json().catch(() => ({})));
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;

    const license = await prisma.associationLicense.create({
      data: {
        userId: user.userId,
        status: "PENDING",
        expiresAt,
      },
    });

    return NextResponse.json({ license }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error, "validation_error"), { status: 400 });
    }
    return jsonInternalError500("POST api/association-licenses/route.ts", error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const user = await requireAuth(token);
    if (!user?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const licenses = await prisma.associationLicense.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ licenses });
  } catch (error) {
    return jsonInternalError500("GET api/association-licenses/route.ts", error);
  }
}
