import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getJwtSecretKeyBytes } from "@/lib/auth";

const ALG = "HS256";
const JWT_TYP = "JLA_DAYOPS";

/** 大会終了日の翌日まで（当日運用の片付け用バッファ） */
const DAY_OPS_UNLOCK_END_DATE_BUFFER_DAYS = 1;
/** 異常に長い大会向けの JWT / クッキー上限（秒） */
const DAY_OPS_UNLOCK_MAX_AGE_CAP_SEC = 60 * 60 * 24 * 120;

/**
 * 大会終了日（UTC 日付）から、当日運用アンロックの失効時刻を求める。
 * `endDate` は日付のみ（00:00 UTC）想定。終了日いっぱい + 翌日バッファまで有効。
 */
export function resolveDayOpsUnlockExpiresAt(endDate: Date): Date {
  return new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate() + 1 + DAY_OPS_UNLOCK_END_DATE_BUFFER_DAYS,
      0,
      0,
      0,
      0
    )
  );
}

/** 大会終了（+バッファ）までのクッキー / JWT 寿命（秒）。失効済みなら 0。 */
export function resolveDayOpsUnlockMaxAgeSec(endDate: Date, now: Date = new Date()): number {
  const expiresAt = resolveDayOpsUnlockExpiresAt(endDate);
  const sec = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  if (sec <= 0) return 0;
  return Math.min(sec, DAY_OPS_UNLOCK_MAX_AGE_CAP_SEC);
}

export function dayOpsUnlockCookieName(competitionId: string): string {
  return `jla_dayops_${competitionId}`;
}

const dayOpsUnlockCookieOptions = (maxAgeSec: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSec,
});

/** Route Handler から当日運用 Cookie を発行（ログイン Cookie と同じ {@link cookies()} API） */
export async function issueDayOpsUnlockCookie(
  competitionId: string,
  maxAgeSec: number
): Promise<void> {
  const jwt = await signDayOpsUnlockJwt(competitionId, maxAgeSec);
  const jar = await cookies();
  jar.set(dayOpsUnlockCookieName(competitionId), jwt, dayOpsUnlockCookieOptions(maxAgeSec));
}

export async function clearDayOpsUnlockCookie(competitionId: string): Promise<void> {
  const jar = await cookies();
  jar.set(dayOpsUnlockCookieName(competitionId), "", {
    ...dayOpsUnlockCookieOptions(0),
    maxAge: 0,
  });
}

export async function signDayOpsUnlockJwt(
  competitionId: string,
  maxAgeSec: number
): Promise<string> {
  return await new SignJWT({ typ: JWT_TYP, cid: competitionId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
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
