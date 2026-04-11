import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getJwtSecretKeyBytes } from "@/lib/auth";

const ALG = "HS256";
const JWT_TYP = "JLA_DAYOPS";
/** 当日運用 UI・API 用クッキーの寿命（秒） */
export const DAY_OPS_UNLOCK_MAX_AGE_SEC = 60 * 60 * 24;

export function dayOpsUnlockCookieName(competitionId: string): string {
  return `jla_dayops_${competitionId}`;
}

export async function signDayOpsUnlockJwt(competitionId: string): Promise<string> {
  return await new SignJWT({ typ: JWT_TYP, cid: competitionId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${DAY_OPS_UNLOCK_MAX_AGE_SEC}s`)
    .sign(getJwtSecretKeyBytes());
}

export async function verifyDayOpsUnlockJwtForCompetition(
  token: string | undefined | null,
  competitionId: string
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKeyBytes(), { algorithms: [ALG] });
    const p = payload as { typ?: unknown; cid?: unknown };
    return p.typ === JWT_TYP && p.cid === competitionId;
  } catch {
    return false;
  }
}

export async function verifyDayOpsUnlockFromRequest(
  request: NextRequest,
  competitionId: string
): Promise<boolean> {
  const raw = request.cookies.get(dayOpsUnlockCookieName(competitionId))?.value;
  return verifyDayOpsUnlockJwtForCompetition(raw, competitionId);
}

/** Server Component 等で {@link cookies()} から検証 */
export async function verifyDayOpsUnlockFromCookies(competitionId: string): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(dayOpsUnlockCookieName(competitionId))?.value;
  return verifyDayOpsUnlockJwtForCompetition(raw, competitionId);
}
