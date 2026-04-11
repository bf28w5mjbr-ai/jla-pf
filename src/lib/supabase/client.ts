import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Client Components / ブラウザ用の Supabase クライアント。
 * `createBrowserClient` はシングルトン相当のため、呼び出しごとに新規接続を増やしません。
 */
export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) {
    throw new Error(
      "Supabase の環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URL と、NEXT_PUBLIC_SUPABASE_ANON_KEY または NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY を .env.local に設定してください。"
    );
  }

  return createBrowserClient(url, key);
}
