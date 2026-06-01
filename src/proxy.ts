import { type NextRequest, NextResponse } from "next/server";
import { tryEarlyAuthenticatedRedirect } from "@/lib/auth/earlyAuthenticatedRedirect";
import { SESSION_COOKIE_NAME, verifySessionEdge } from "@/lib/auth/sessionEdge";
import { getCompetitionBrowseRedirect } from "@/lib/competitionBrowseRedirect";
import { updateSession } from "@/lib/supabase/middleware";

function readSessionToken(request: NextRequest): string | undefined {
  const fromJar = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (fromJar) return fromJar;
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === SESSION_COOKIE_NAME) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
}

async function tryCompetitionBrowseRedirect(
  request: NextRequest
): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const token = readSessionToken(request);
  const session = token ? await verifySessionEdge(token) : null;
  const isLoggedIn = Boolean(session?.userId);

  const destination = getCompetitionBrowseRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
    isLoggedIn
  );
  if (!destination) return null;

  return NextResponse.redirect(new URL(destination, request.url), 307);
}

export async function proxy(request: NextRequest) {
  const competitionBrowseRedirect = await tryCompetitionBrowseRedirect(request);
  if (competitionBrowseRedirect) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    competitionBrowseRedirect.headers.set("x-request-id", requestId);
    return competitionBrowseRedirect;
  }

  const earlyRedirect = await tryEarlyAuthenticatedRedirect(request);
  if (earlyRedirect) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    earlyRedirect.headers.set("x-request-id", requestId);
    return earlyRedirect;
  }

  const requestHeaders = new Headers(request.headers);
  const requestId = requestHeaders.get("x-request-id") ?? crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    /*
     * 静的アセット等を除外（公式ドキュメントの matcher に準拠）
     * `/api` は独自 Cookie 認証が多く、ここで Supabase の getUser を毎回走らせると
     * アップロード等の POST が遅延・不安定になりやすいため除外する。
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
