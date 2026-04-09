import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";

const RegisterDeviceTokenSchema = z.object({
  token: z.string().min(20),
  platform: z.enum(["ios", "android", "web"]),
});

const DeleteDeviceTokenSchema = z.object({
  token: z.string().min(20),
});

async function getSessionUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) {
    return null;
  }
  const session = await verifySession(token);
  return session?.userId ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const data = RegisterDeviceTokenSchema.parse(body);

    await prisma.deviceToken.upsert({
      where: { token: data.token },
      update: {
        userId,
        platform: data.platform,
        active: true,
      },
      create: {
        userId,
        token: data.token,
        platform: data.platform,
        active: true,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }
    return jsonInternalError500("POST api/device-tokens/route.ts", error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const data = DeleteDeviceTokenSchema.parse(body);

    await prisma.deviceToken.updateMany({
      where: {
        token: data.token,
        userId,
      },
      data: {
        active: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }
    return jsonInternalError500("DELETE api/device-tokens/route.ts", error);
  }
}
