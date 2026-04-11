export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";

type PasskeyPrismaClient = typeof prisma & {
  passkeyCredential: {
    findMany: (args: unknown) => Promise<Array<{ credentialId: Buffer; transports: unknown }>>;
  };
  passkeyChallenge: {
    deleteMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
};

const passkeyPrisma = prisma as PasskeyPrismaClient;

export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, familyName: true, givenName: true },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const host = req.headers.get("host") ?? "localhost";
    const rpID = process.env.WEBAUTHN_RP_ID ?? host.split(":")[0];

    const existingCredentials = await passkeyPrisma.passkeyCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: "Bluvium",
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: `${user.familyName}${user.givenName}`,
      attestationType: "none",
      excludeCredentials: existingCredentials.map((credential) => ({
        id: isoBase64URL.fromBuffer(Buffer.from(credential.credentialId)),
      })),
    });

    await passkeyPrisma.passkeyChallenge.deleteMany({ where: { userId: user.id } });
    await passkeyPrisma.passkeyChallenge.create({
      data: {
        userId: user.id,
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return NextResponse.json(options);
  } catch (error) {
    return jsonInternalError500("POST api/passkeys/registration/options/route.ts", error);
  }
}
