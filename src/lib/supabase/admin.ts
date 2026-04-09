import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/env";

export function createAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase 管理クライアントの環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

