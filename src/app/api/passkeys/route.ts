export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";

type CredentialListRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  label: string;
  lastUsedAt: Date | null;
};

type CredentialOwnerRow = { userId: string };

type PasskeyPrismaClient = typeof prisma & {
  passkeyCredential: {
    findMany: (args: unknown) => Promise<CredentialListRow[]>;
    findUnique: (args: unknown) => Promise<CredentialOwnerRow | null>;
    update: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
  };
};

const passkeyPrisma = prisma as PasskeyPrismaClient;

const DeleteSchema = z.object({
  id: z.string().min(1),
});

const UpdateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(50),
});

export async function GET() {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const session = await verifySession(token);
  if (!session?.userId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const credentials = await passkeyPrisma.passkeyCredential.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      label: true,
      lastUsedAt: true,
    },
  });

  return NextResponse.json({ credentials });
}

export async function PATCH(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data = UpdateSchema.parse(body);

    const credential = await passkeyPrisma.passkeyCredential.findUnique({
      where: { id: data.id },
      select: { userId: true },
    });

    if (!credential || credential.userId !== session.userId) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    await passkeyPrisma.passkeyCredential.update({
      where: { id: data.id },
      data: { label: data.label },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    return jsonInternalError500("PATCH api/passkeys/route.ts", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data = DeleteSchema.parse(body);

    const credential = await passkeyPrisma.passkeyCredential.findUnique({
      where: { id: data.id },
      select: { userId: true },
    });

    if (!credential || credential.userId !== session.userId) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    await passkeyPrisma.passkeyCredential.delete({ where: { id: data.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    return jsonInternalError500("DELETE api/passkeys/route.ts", error);
  }
}
