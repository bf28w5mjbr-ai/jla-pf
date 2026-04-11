import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Server Components / Server Actions / Route Handlers 用の Supabase クライアント。
 * リクエストの Cookie にセッションを紐づけます。
 */
export async function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) {
    throw new Error(
      "Supabase の環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URL と、NEXT_PUBLIC_SUPABASE_ANON_KEY または NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY を .env.local に設定してください。"
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component では set ができないルートがあり得る。Middleware でセッション更新する想定。
        }
      },
    },
  });
}
