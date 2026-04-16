import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
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
