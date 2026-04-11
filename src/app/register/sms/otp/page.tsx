"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RegistrationStepper } from "@/components/auth/RegistrationStepper";
import Link from "next/link";
import { clearRegistrationFormDraft } from "@/lib/registrationFormDraft";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";
import { AuthShell, AuthPanel, AuthShellBrandedFallback } from "@/components/auth/AuthShell";
import { Mail, Smartphone } from "lucide-react";

function OTPVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const phone = searchParams.get("phone");
  const redirectAfterRegister = safePostLoginPath(searchParams.get("redirect"));
  const isEmailFlow = searchParams.get("delivery") === "email";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      toast.error("セッションIDが見つかりません");
      router.push(appendRedirectQuery("/register", redirectAfterRegister));
    }
  }, [sessionId, router, redirectAfterRegister]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data.error || "認証に失敗しました";
        setError(message);
        toast.error(message);

        if (data.maxAttemptsReached) {
          setTimeout(
            () => router.push(appendRedirectQuery("/register", redirectAfterRegister)),
            2000
          );
        }
        return;
      }

      toast.success(
        isEmailFlow
          ? "メールで本人確認ができました。パスキー設定へ進みます。"
          : "電話番号を確認しました。パスキー設定へ進みます。"
      );
      clearRegistrationFormDraft();
      const next = data.next || "/register/passkey";
      if (redirectAfterRegister) {
        const sep = next.includes("?") ? "&" : "?";
        router.push(`${next}${sep}returnTo=${encodeURIComponent(redirectAfterRegister)}`);
      } else {
        router.push(next);
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      const message = "認証に失敗しました";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!phone) {
      toast.error("電話番号が見つかりません");
      return;
    }

    setResending(true);

    try {
      const res = await fetch("/api/registration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phone,
          resend: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "再送信に失敗しました");
        if (data.cooldown) {
          setCooldown(data.cooldown);
        }
        return;
      }

      const viaEmail = data.otpDelivery === "email";
      toast.success(
        viaEmail
          ? `認証コードをメールで再送信しました${
              typeof data.otpDeliveryHint === "string" ? `（${data.otpDeliveryHint}）` : ""
            }`
          : "認証コードを再送信しました"
      );
      setCooldown(60);
      if (viaEmail) {
        const base = `/register/sms/otp?sessionId=${sessionId}&phone=${encodeURIComponent(phone || "")}&delivery=email`;
        router.replace(appendRedirectQuery(base, redirectAfterRegister));
      }
    } catch (err) {
      console.error("Resend error:", err);
      toast.error("再送信に失敗しました");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      maxWidth="md"
      title="新規登録"
      subtitle={
        isEmailFlow
          ? "登録メールに届いた6桁のコードを入力して、本人確認を完了してください。"
          : "SMSで届いた6桁のコードを入力して、電話番号を確認してください。"
      }
      subtitleDensity="guided"
    >
      <RegistrationStepper
        currentStep={2}
        step2Label={isEmailFlow ? "メール認証" : undefined}
      />
      <AuthPanel>
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
            {isEmailFlow ? (
              <Mail className="h-6 w-6" aria-hidden />
            ) : (
              <Smartphone className="h-6 w-6" aria-hidden />
            )}
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            {isEmailFlow ? "メール認証" : "電話番号認証"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {isEmailFlow ? (
              <>
                登録時のメールアドレスに送信したコードを入力してください。
                <span className="mt-1 block text-xs text-gray-500">
                  電話番号はSMS再開後にプロフィールから確認・更新できます。
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-gray-800">{phone || "ご登録の携帯番号"}</span>
                に送信したコードを入力してください。
              </>
            )}
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-gray-700">
              認証コード（6桁）
            </Label>
            <Input
              id="otp"
              type="text"
              numericInput="integer"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value);
                if (error) setError(null);
              }}
              required
              className="h-14 text-center font-mono text-2xl tracking-[0.35em] text-gray-900 placeholder:text-gray-300"
            />
            <p className="text-xs text-gray-500">有効期限は約5分です。</p>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-lg text-base font-semibold"
            disabled={loading || otp.length !== 6}
          >
            {loading ? "確認中..." : "認証する"}
          </Button>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-lg"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
            >
              {cooldown > 0
                ? `コードを再送信（${cooldown}秒後）`
                : resending
                  ? "送信中..."
                  : "コードを再送信"}
            </Button>
            <p className="text-center text-xs leading-relaxed text-gray-500">
              {isEmailFlow
                ? "届かない場合は迷惑メールフォルダやドメイン受信設定をご確認ください。"
                : "届かない場合は迷惑メール設定や電波状況をご確認ください。"}
            </p>
          </div>

          <Button variant="ghost" className="w-full text-gray-600" asChild>
            <Link href={appendRedirectQuery("/register", redirectAfterRegister)}>
              入力画面に戻る
            </Link>
          </Button>
        </form>
      </AuthPanel>
    </AuthShell>
  );
}

export default function OTPVerifyPage() {
  return (
    <Suspense fallback={<AuthShellBrandedFallback />}>
      <OTPVerifyContent />
    </Suspense>
  );
}
