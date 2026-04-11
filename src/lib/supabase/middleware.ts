import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Next.js の proxy（旧 middleware）から呼び出し、Cookie 上の Supabase セッションを更新してレスポンスに載せます。
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function updateSession(request: NextRequest, forwardedHeaders?: Headers) {
  const headers = forwardedHeaders ?? new Headers(request.headers);
  const requestId = headers.get("x-request-id");
  let supabaseResponse = NextResponse.next({
    request: { headers },
  });

  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) {
    if (requestId) supabaseResponse.headers.set("x-request-id", requestId);
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: { headers },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // セッションのリフレッシュ（期限切れトークンの更新）
  await supabase.auth.getUser();

  if (requestId) supabaseResponse.headers.set("x-request-id", requestId);
  return supabaseResponse;
}
