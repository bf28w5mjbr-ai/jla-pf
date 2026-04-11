import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "../../../../lib/auth";
import { prisma } from "../../../../server/db";
import { cookies } from "next/headers";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";

const languageSchema = z.object({
  preferredLanguage: z.string().min(2).max(10),
});

async function requireSessionUser() {
  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return null;
  }
  return session.userId;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireSessionUser();
    if (!userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const payload = languageSchema.parse(await req.json());
    const user = await prisma.user.update({
      where: { id: userId },
      data: { preferredLanguage: payload.preferredLanguage },
      select: { preferredLanguage: true },
    });

    return NextResponse.json({ preferredLanguage: user.preferredLanguage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error, "validation_error"), { status: 400 });
    }
    return jsonInternalError500("POST api/user/language/route.ts", error);
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}

export async function GET() {
  try {
    const userId = await requireSessionUser();
    if (!userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true },
    });

    return NextResponse.json({ preferredLanguage: user?.preferredLanguage ?? null });
  } catch (error) {
    return jsonInternalError500("GET api/user/language/route.ts", error);
  }
}
