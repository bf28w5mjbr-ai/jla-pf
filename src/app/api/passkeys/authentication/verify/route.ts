export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { cookies } from "next/headers";
import { signSession } from "@/lib/auth";
import { z } from "zod";
import { onAuthLoginSuccess } from "@/lib/authLoginSuccess";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { jsonInternalError500 } from "@/lib/apiInternalError";

type PasskeyWithUser = {
  id: string;
  credentialId: Buffer;
  publicKey: Buffer;
  counter: number;
  userId: string;
  user: { id: string; email: string | null; familyName: string; givenName: string };
};

type PasskeyPrismaClient = typeof prisma & {
  passkeyCredential: {
    findFirst: (args: unknown) => Promise<PasskeyWithUser | null>;
    update: (args: unknown) => Promise<unknown>;
  };
};

const passkeyPrisma = prisma as PasskeyPrismaClient;

const VerifySchema = z.object({
  credential: z.any(),
});

const CHALLENGE_COOKIE = "passkey_auth_challenge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = VerifySchema.parse(body);

    const jar = await cookies();
    const expectedChallenge = jar.get(CHALLENGE_COOKIE)?.value;

    if (!expectedChallenge) {
      return NextResponse.json({ error: "認証セッションが見つかりません" }, { status: 400 });
    }

    const host = req.headers.get("host") ?? "localhost";
    const rpID = process.env.WEBAUTHN_RP_ID ?? host.split(":")[0];
    const expectedOrigin = process.env.WEBAUTHN_ORIGIN ?? req.nextUrl.origin;

    const credentialId = isoBase64URL.toBuffer(data.credential?.id ?? "");

    const credential = await passkeyPrisma.passkeyCredential.findFirst({
      where: { credentialId: Buffer.from(credentialId) },
      include: { user: true },
    });

    if (!credential) {
      return NextResponse.json({ error: "パスキーが見つかりません" }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response: data.credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
      authenticator: {
        credentialID: isoBase64URL.fromBuffer(credential.credentialId),
        credentialPublicKey: credential.publicKey,
        counter: credential.counter,
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json({ error: "パスキー認証に失敗しました" }, { status: 400 });
    }

    await passkeyPrisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    jar.set(CHALLENGE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    const token = await signSession({ userId: credential.userId });
    jar.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    await onAuthLoginSuccess(credential.userId, req, { channel: "PASSKEY" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(error), { status: 400 });
    }

    return jsonInternalError500(
      "POST api/passkeys/authentication/verify/route.ts",
      error
    );
  }
}
