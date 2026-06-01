export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/auth";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import {
  resolveWebAuthnExpectedOrigins,
  tryWebAuthnVerifyErrorResponse,
  webAuthnRequireUserVerification,
} from "@/lib/webauthnServer";
import { resolveWebAuthnRpId } from "@/lib/webauthnRpId";

type PasskeyPrismaClient = typeof prisma & {
  passkeyCredential: {
    create: (args: unknown) => Promise<unknown>;
  };
  passkeyChallenge: {
    findFirst: (args: unknown) => Promise<{
      userId: string;
      challenge: string;
      expiresAt: Date;
      createdAt: Date;
    } | null>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

const passkeyPrisma = prisma as PasskeyPrismaClient;

const VerifySchema = z.object({
  credential: z.any(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = VerifySchema.parse(body);

    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const challengeRecord = await passkeyPrisma.passkeyChallenge.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!challengeRecord) {
      return NextResponse.json({ error: "チャレンジが見つかりません" }, { status: 400 });
    }

    if (new Date() > challengeRecord.expiresAt) {
      await passkeyPrisma.passkeyChallenge.deleteMany({ where: { userId: user.id } });
      return NextResponse.json({ error: "チャレンジの有効期限が切れました" }, { status: 400 });
    }

    const rpID = resolveWebAuthnRpId(req);
    const expectedOrigin = resolveWebAuthnExpectedOrigins(req);

    const verification = await verifyRegistrationResponse({
      response: data.credential,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: webAuthnRequireUserVerification(),
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "パスキー登録に失敗しました" }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    await passkeyPrisma.passkeyCredential.create({
      data: {
        userId: user.id,
        credentialId: Buffer.from(credentialID),
        publicKey: Buffer.from(credentialPublicKey),
        counter,
        transports: data.credential?.response?.transports ?? null,
        label: "パスキー",
      },
    });

    await passkeyPrisma.passkeyChallenge.deleteMany({ where: { userId: user.id } });

    const newToken = await signSession({ userId: user.id });
    jar.set("session", newToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    const mapped = tryWebAuthnVerifyErrorResponse(error);
    if (mapped) return mapped;

    return jsonInternalError500(
      "POST api/passkeys/registration/verify/route.ts",
      error
    );
  }
}
