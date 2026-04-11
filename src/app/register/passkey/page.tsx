"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RegistrationStepper } from "@/components/auth/RegistrationStepper";
import { AuthShell, AuthPanel, AuthShellBrandedFallback } from "@/components/auth/AuthShell";
import { Fingerprint } from "lucide-react";
import { safePostLoginPath } from "@/lib/postLoginRedirect";

function PasskeyRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safePostLoginPath(searchParams.get("returnTo")) ?? "/dashboard";

  const [loading, setLoading] = useState(false);
  const [supportsPasskey, setSupportsPasskey] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupportsPasskey(!!window.PublicKeyCredential);
  }, []);

  const handlePasskeyRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      const optionsRes = await fetch("/api/passkeys/registration/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const options = await optionsRes.json();

      if (!optionsRes.ok) {
        throw new Error(options.error || "パスキー登録の初期化に失敗しました");
      }

      const registrationResponse = await startRegistration(options);

      const verifyRes = await fetch("/api/passkeys/registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: registrationResponse }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "パスキー登録に失敗しました");
      }

      toast.success("パスキー登録が完了しました。");
      router.push(returnTo);
    } catch (err) {
      console.error("Passkey registration error:", err);
      const msg = err instanceof Error ? err.message : "パスキー登録に失敗しました";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      maxWidth="md"
      title="新規登録"
      subtitle="パスキーを登録すると、次回から指紋や顔認証などでスムーズにログインできます（任意）。"
      subtitleDensity="guided"
    >
      <RegistrationStepper currentStep={3} />
      <AuthPanel>
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
            <Fingerprint className="h-6 w-6" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">パスキー登録</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            パスキーは端末・ブラウザに紐づくログイン手段で、SMS やパスワードよりフィッシングに強い運用ができます。常用する端末ごとに登録してください。あとから
            <span className="whitespace-nowrap">「セキュリティ設定」</span>
            からも追加できます。
          </p>
        </div>

        <div className="space-y-4">
          {!supportsPasskey && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              この端末はパスキーに対応していません。別の端末であとから設定できます。
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            className="h-11 w-full rounded-lg text-base font-semibold"
            onClick={handlePasskeyRegister}
            disabled={loading || !supportsPasskey}
          >
            {loading ? "処理中..." : "パスキーを登録する"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-lg"
            onClick={() => router.push(returnTo)}
            disabled={loading}
          >
            あとで設定する
          </Button>
        </div>
      </AuthPanel>
    </AuthShell>
  );
}

export default function PasskeyRegisterPage() {
  return (
    <Suspense fallback={<AuthShellBrandedFallback />}>
      <PasskeyRegisterContent />
    </Suspense>
  );
}
