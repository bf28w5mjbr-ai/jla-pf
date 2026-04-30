import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * `@supabase/supabase-js` の既定 storageKey（createServerClient で storageKey 未指定時と同じ）。
 * Cookie 名は `sb-<hostnameの先頭ラベル>-auth-token` およびチャンク用の `.0` 接尾辞。
 */
function defaultSupabaseAuthCookiePrefix(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const first = host.split(".")[0];
    if (!first) return null;
    return `sb-${first}-auth-token`;
  } catch {
    return null;
  }
}

function requestHasSupabaseAuthSessionCookies(
  request: NextRequest,
  supabaseUrl: string
): boolean {
  const prefix = defaultSupabaseAuthCookiePrefix(supabaseUrl);
  if (!prefix) return true;
  return request.cookies.getAll().some(
    (c) => c.name === prefix || c.name.startsWith(`${prefix}.`)
  );
}

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

  /* Supabase セッション Cookie が無いリクエストでは getUser()（Auth API 往復）を省略する */
  if (!requestHasSupabaseAuthSessionCookies(request, url)) {
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
