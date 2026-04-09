import { createClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";

function createOtpClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error("Supabase OTP用の環境変数が未設定です");
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

