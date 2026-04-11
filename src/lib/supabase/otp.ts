import { createClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";

function createOtpClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    const missing = [!url && "URL", !key && "publishable/anon key"].filter(Boolean).join(", ");
    throw new Error(
      `Supabase OTP用の環境変数が未設定です（不足: ${missing}）。NEXT_PUBLIC_SUPABASE_URL（または SUPABASE_URL）と、NEXT_PUBLIC_SUPABASE_ANON_KEY（または SUPABASE_ANON_KEY / Publishable 系）を設定し、開発サーバーを再起動してください。`
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function sendSmsOtpViaSupabase(phoneE164: string): Promise<void> {
  const supabase = createOtpClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: {
      shouldCreateUser: false,
    },
  });
  if (error) {
    throw new Error(error.message || "Supabase OTP送信に失敗しました");
  }
}

export async function ensureSupabasePhoneUser(phoneE164: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    phone: phoneE164,
    phone_confirm: true,
  });
  if (!error) return;

  const msg = error.message.toLowerCase();
  if (
    msg.includes("already") ||
    msg.includes("exists") ||
    msg.includes("registered") ||
    msg.includes("duplicate")
  ) {
    return;
  }
  throw new Error(error.message || "Supabase Authユーザー作成に失敗しました");
}

export async function verifySmsOtpViaSupabase(
  phoneE164: string,
  otp: string
): Promise<boolean> {
  const supabase = createOtpClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token: otp,
    type: "sms",
  });
  return !error;
}

