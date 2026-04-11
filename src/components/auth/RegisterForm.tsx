"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { REGISTRATION_FORM_DRAFT_KEY } from "@/lib/registrationFormDraft";
import { AuthPanel } from "@/components/auth/AuthShell";
import { FormSection } from "@/components/auth/FormSection";
import { fieldHintClass, pageLeadClass } from "@/lib/explanation";
import { appendRedirectQuery, safePostLoginPath } from "@/lib/postLoginRedirect";

const INITIAL_FORM = {
  email: "",
  password: "",
  confirmPassword: "",
  familyName: "",
  givenName: "",
  familyNameKana: "",
  givenNameKana: "",
  dateOfBirth: "",
  sex: "MALE" as "MALE" | "FEMALE" | "OTHER",
  phoneNumber: "",
  postalCode: "",
  prefecture: "",
  city: "",
  addressLine1: "",
  addressLine2: "",
  emergencyContactFamilyName: "",
  emergencyContactGivenName: "",
  emergencyContactFamilyNameKana: "",
  emergencyContactGivenNameKana: "",
  emergencyContactPhone: "",
};

type FormState = typeof INITIAL_FORM;

function parseDraft(raw: string): Partial<FormState> {
  try {
    const v = JSON.parse(raw) as Partial<FormState>;
    if (!v || typeof v !== "object") return {};
    const sex =
      v.sex === "MALE" || v.sex === "FEMALE" || v.sex === "OTHER"
        ? v.sex
        : INITIAL_FORM.sex;
    return { ...v, sex };
  } catch {
    return {};
  }
}

function firstZodIssueMessage(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const first = details[0] as { message?: string };
  return typeof first?.message === "string" ? first.message : null;
}

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectAfterRegister = safePostLoginPath(searchParams.get("redirect"));
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REGISTRATION_FORM_DRAFT_KEY);
      if (raw) {
        const partial = parseDraft(raw);
        setFormData((prev) => ({ ...prev, ...partial }));
      }
    } catch {
      // ignore
    }
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    try {
      sessionStorage.setItem(REGISTRATION_FORM_DRAFT_KEY, JSON.stringify(formData));
    } catch {
      // ignore
    }
  }, [formData, draftHydrated]);

  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, postalCode });

    if (postalCode.length === 7) {
      try {
        const res = await fetch(`/api/postal-code?zipcode=${postalCode}`);
        const data = await res.json();

        if (data.results && data.results[0]) {
          const result = data.results[0];
          setFormData((prev) => ({
            ...prev,
            prefecture: result.address1,
            city: result.address2,
            addressLine1: result.address3,
          }));
          toast.success("住所を自動入力しました");
        } else {
          toast.message("該当する住所が見つかりませんでした", {
            description: "都道府県・市区町村・町名を手入力してください。",
          });
        }
      } catch (error) {
        console.error("Failed to fetch address:", error);
        toast.error("住所の自動入力に失敗しました。手入力してください。");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("パスワードが一致しません");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/registration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          familyName: formData.familyName,
          givenName: formData.givenName,
          familyNameKana: formData.familyNameKana,
          givenNameKana: formData.givenNameKana,
          dateOfBirth: formData.dateOfBirth,
          sex: formData.sex,
          phoneNumber: formData.phoneNumber,
          postalCode: formData.postalCode,
          prefecture: formData.prefecture,
          city: formData.city,
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2,
          emergencyContactFamilyName: formData.emergencyContactFamilyName,
          emergencyContactGivenName: formData.emergencyContactGivenName,
          emergencyContactFamilyNameKana: formData.emergencyContactFamilyNameKana,
          emergencyContactGivenNameKana: formData.emergencyContactGivenNameKana,
          emergencyContactPhone: formData.emergencyContactPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const baseMsg = data.error || "登録に失敗しました";
        const detailMsg = firstZodIssueMessage(data.details);
        const message = detailMsg || baseMsg;
        const suggestLogin =
          data.existingUser === true ||
          (typeof baseMsg === "string" && baseMsg.includes("既に登録"));

        if (suggestLogin) {
          toast.error(message, {
            action: {
              label: "ログインへ",
              onClick: () => router.push(appendRedirectQuery("/login", redirectAfterRegister)),
            },
            duration: 12_000,
          });
        } else {
          toast.error(message);
        }
        return;
      }

      if (!data?.sessionId) {
        toast.error("登録後の処理に失敗しました");
        return;
      }

      const viaEmail = data.otpDelivery === "email";
      toast.success(
        viaEmail
          ? `認証コードをメールで送信しました${
              typeof data.otpDeliveryHint === "string"
                ? `（${data.otpDeliveryHint}）`
                : ""
            }`
          : "認証コードを送信しました。SMSを確認してください。"
      );
      const deliveryQ = viaEmail ? "&delivery=email" : "";
      const otpBase = `/register/sms/otp?sessionId=${data.sessionId}&phone=${encodeURIComponent(formData.phoneNumber)}${deliveryQ}`;
      router.push(appendRedirectQuery(otpBase, redirectAfterRegister));
    } catch (err) {
      console.error("Register error:", err);
      toast.error("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPanel>
      <div className="mb-6 border-b border-border pb-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">必須情報の入力</h2>
        <p className={pageLeadClass("balanced")}>
          登録メールまたはSMSで届く認証コードにより本人確認を行い、アカウントを作成します。パスキーは任意です。JLA番号は選手登録の申請時に入力します。
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-8">
        <FormSection title="基本情報" description="ログインと本人確認に使います。" descriptionDensity="balanced">
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス *</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="familyName">姓 *</Label>
              <Input
                id="familyName"
                type="text"
                placeholder="山田"
                value={formData.familyName}
                onChange={(e) => setFormData({ ...formData, familyName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="givenName">名 *</Label>
              <Input
                id="givenName"
                type="text"
                placeholder="太郎"
                value={formData.givenName}
                onChange={(e) => setFormData({ ...formData, givenName: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="familyNameKana">姓（カナ） *</Label>
              <Input
                id="familyNameKana"
                type="text"
                placeholder="ヤマダ"
                value={formData.familyNameKana}
                onChange={(e) => setFormData({ ...formData, familyNameKana: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="givenNameKana">名（カナ） *</Label>
              <Input
                id="givenNameKana"
                type="text"
                placeholder="タロウ"
                value={formData.givenNameKana}
                onChange={(e) => setFormData({ ...formData, givenNameKana: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">生年月日 *</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>性別 *</Label>
            <RadioGroup
              value={formData.sex}
              onValueChange={(value) => setFormData({ ...formData, sex: value as "MALE" | "FEMALE" | "OTHER" })}
              className="flex flex-wrap gap-x-5 gap-y-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="MALE" id="male" />
                <Label htmlFor="male" className="font-normal cursor-pointer">男性</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="FEMALE" id="female" />
                <Label htmlFor="female" className="font-normal cursor-pointer">女性</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="OTHER" id="other" />
                <Label htmlFor="other" className="font-normal cursor-pointer">その他</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">電話番号 *</Label>
            <Input
              id="phoneNumber"
              type="tel"
              numericInput="integer"
              placeholder="09012345678"
              maxLength={11}
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              required
            />
            <p className={fieldHintClass("compact")}>携帯電話番号（ハイフンなし11桁）</p>
          </div>
        </FormSection>

        <FormSection
          title="住所"
          description="郵便番号を入力すると、市区町村まで自動入力されることがあります。"
          descriptionDensity="guided"
        >
          <div className="space-y-2">
            <Label htmlFor="postalCode">郵便番号 *</Label>
            <Input
              id="postalCode"
              type="text"
              numericInput="integer"
              placeholder="1234567"
              maxLength={7}
              value={formData.postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              required
            />
            <p className={fieldHintClass("compact")}>ハイフンなし7桁</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prefecture">都道府県 *</Label>
              <Input
                id="prefecture"
                type="text"
                placeholder="東京都"
                value={formData.prefecture}
                onChange={(e) => setFormData({ ...formData, prefecture: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">市区町村 *</Label>
              <Input
                id="city"
                type="text"
                placeholder="渋谷区"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine1">町名・番地 *</Label>
            <Input
              id="addressLine1"
              type="text"
              placeholder="神南1-2-3"
              value={formData.addressLine1}
              onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
              required
            />
            <p className={fieldHintClass("balanced")}>番地まで入力してください（例: 神南1-2-3）</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine2">建物名・部屋番号（任意）</Label>
            <Input
              id="addressLine2"
              type="text"
              placeholder="渋谷ビル 101号室"
              value={formData.addressLine2}
              onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
            />
          </div>
        </FormSection>

        <FormSection title="緊急連絡先" descriptionDensity="compact">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactFamilyName">姓 *</Label>
                  <Input
                    id="emergencyContactFamilyName"
                    type="text"
                    placeholder="山田"
                    value={formData.emergencyContactFamilyName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactFamilyName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactGivenName">名 *</Label>
                  <Input
                    id="emergencyContactGivenName"
                    type="text"
                    placeholder="花子"
                    value={formData.emergencyContactGivenName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactGivenName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactFamilyNameKana">セイ *</Label>
                  <Input
                    id="emergencyContactFamilyNameKana"
                    type="text"
                    placeholder="ヤマダ"
                    value={formData.emergencyContactFamilyNameKana}
                    onChange={(e) => setFormData({ ...formData, emergencyContactFamilyNameKana: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactGivenNameKana">メイ *</Label>
                  <Input
                    id="emergencyContactGivenNameKana"
                    type="text"
                    placeholder="ハナコ"
                    value={formData.emergencyContactGivenNameKana}
                    onChange={(e) => setFormData({ ...formData, emergencyContactGivenNameKana: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergencyContactPhone">緊急連絡先電話番号 *</Label>
                <Input
                  id="emergencyContactPhone"
                  type="tel"
                  numericInput="integer"
                  placeholder="09012345678"
                  maxLength={11}
                  value={formData.emergencyContactPhone}
                  onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                  required
                />
                <p className={fieldHintClass("compact")}>ハイフンなし11桁</p>
              </div>
        </FormSection>

        <FormSection title="パスワード" descriptionDensity="compact">
          <div className="space-y-2">
            <Label htmlFor="password">パスワード *</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="8文字以上"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={8}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className={fieldHintClass("balanced")}>英数字を組み合わせた8文字以上を推奨します。</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">パスワード（確認） *</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="パスワードを再入力"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                minLength={8}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={showConfirmPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </FormSection>

        <div className="space-y-4 border-t border-border pt-6">
          <Button type="submit" className="h-11 w-full rounded-lg text-base font-semibold" disabled={loading}>
            {loading ? "送信中..." : "認証コードを送信"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            既にアカウントをお持ちですか？{" "}
            <Button asChild variant="outline" size="sm" className="ml-1 h-9">
              <Link href={appendRedirectQuery("/login", redirectAfterRegister)}>ログイン</Link>
            </Button>
          </p>
        </div>
      </form>
    </AuthPanel>
  );
}

export default function RegisterForm() {
  return (
    <Suspense
      fallback={
        <AuthPanel>
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        </AuthPanel>
      }
    >
      <RegisterFormInner />
    </Suspense>
  );
}
