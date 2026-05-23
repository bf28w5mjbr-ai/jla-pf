import { cookies } from "next/headers";
import { signSession } from "@/lib/auth";

export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export async function issueSessionCookie(userId: string): Promise<void> {
  const token = await signSession({ userId });
  const jar = await cookies();
  jar.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
  });
}
