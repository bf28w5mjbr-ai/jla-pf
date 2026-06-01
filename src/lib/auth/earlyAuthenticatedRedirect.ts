import { type NextRequest, NextResponse } from "next/server";
import { isCoverPageHost, resolveRequestHostname } from "@/lib/coverPageHost";
import { safePostLoginPath } from "@/lib/postLoginRedirect";
import { SESSION_COOKIE_NAME, verifySessionEdge } from "@/lib/auth/sessionEdge";

function readSessionToken(request: NextRequest): string | undefined {
  const fromJar = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (fromJar) return fromJar;
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq);
    if (name === SESSION_COOKIE_NAME) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
}

function postLoginDestination(request: NextRequest): string {
  if (request.nextUrl.pathname === "/login") {
    return safePostLoginPath(request.nextUrl.searchParams.get("redirect")) ?? "/dashboard";
  }
  return "/dashboard";
}

/**
 * カバーページホストで、有効な session Cookie がある `/` または `/login` へのアクセスを
 * Edge で即リダイレクトする（ランディング SSR を省略）。
 */
export async function tryEarlyAuthenticatedRedirect(
  request: NextRequest
): Promise<NextResponse | null> {
  const host = resolveRequestHostname(
    request.headers.get("host"),
    request.nextUrl.hostname
  );
  if (!isCoverPageHost(host)) return null;

  const { pathname } = request.nextUrl;
  if (pathname !== "/" && pathname !== "/login") return null;

  const token = readSessionToken(request);
  if (!token) return null;

  const session = await verifySessionEdge(token);
  if (!session?.userId) return null;

  const destination = postLoginDestination(request);
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";
  return NextResponse.redirect(url, 307);
}
