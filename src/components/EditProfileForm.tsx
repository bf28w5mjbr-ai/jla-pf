"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { fieldHintClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";
import {
  PhoneNumberField,
  validatePhoneFieldValue,
} from "@/components/ui/PhoneNumberField";

interface EditProfileFormProps {
  user: {
    id: string;
    familyName: string;
    givenName: string;
    familyNameKana: string;
    givenNameKana: string;
    dateOfBirth: Date;
    sex: string;
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine1: string;
    addressLine2: string | null;
    emergencyContactFamilyName: string | null;
    emergencyContactGivenName: string | null;
    emergencyContactPhone: string | null;
  };
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof User;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6",
        "transition-[border-color,background-color] duration-200",
        "hover:border-orange-200/70 hover:bg-orange-50/20 dark:hover:border-orange-900/45 dark:hover:bg-orange-950/10",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-orange-500/8 dark:bg-orange-400/6"
        aria-hidden
      />
      <div
        className="absolute bottom-5 left-0 top-5 w-0.5 rounded-full bg-gradient-to-b from-orange-500/70 via-orange-400/30 to-transparent sm:bottom-6 sm:top-6"
        aria-hidden
      />

      <div className="relative pl-3 sm:pl-4">
        <div className="mb-5 flex gap-3 border-b border-border/45 pb-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground">
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </p>
            {description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}

export default function EditProfileForm({ user }: EditProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    familyName: user.familyName,
    givenName: user.givenName,
    familyNameKana: user.familyNameKana,
    givenNameKana: user.givenNameKana,
    dateOfBirth: new Date(user.dateOfBirth).toISOString().split("T")[0],
    sex: user.sex as "MALE" | "FEMALE" | "OTHER",
    postalCode: user.postalCode,
    prefecture: user.prefecture,
    city: user.city,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2 || "",
    emergencyContactFamilyName: user.emergencyContactFamilyName || "",
    emergencyContactGivenName: user.emergencyContactGivenName || "",
    emergencyContactPhone: user.emergencyContactPhone || "",
  });

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
        }
      } catch (error) {
        console.error("Failed to fetch address:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.emergencyContactPhone.trim()) {
      const phoneErr = validatePhoneFieldValue(
        formData.emergencyContactPhone,
        false
      );
      if (phoneErr) {
        toast.error(phoneErr);
        return;
      }
    }

    setLoading(true);

    try {
      const res = await fetch("/api/user/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "更新に失敗しました");
        return;
      }

      toast.success("個人情報を更新しました");
      router.push("/settings");
      router.refresh();
    } catch (err) {
      console.error("Update error:", err);
      toast.error("更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const fieldGrid = "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4";

  return (
    <AutofillSyncForm onSubmit={handleSubmit} className="space-y-5">
      <FormSection
        icon={User}
        title="基本情報"
        description="身分証・大会記録などに利用される氏名と生年月日です。"
      >
            <div className={fieldGrid}>
              <div className="space-y-2">
                <Label htmlFor="familyName">姓 *</Label>
                <Input
                  id="familyName"
                  name="familyName"
                  type="text"
                  autoComplete="family-name"
                  value={formData.familyName}
                  onChange={(e) => setFormData({ ...formData, familyName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="givenName">名 *</Label>
                <Input
                  id="givenName"
                  name="givenName"
                  type="text"
                  autoComplete="given-name"
                  value={formData.givenName}
                  onChange={(e) => setFormData({ ...formData, givenName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className={fieldGrid}>
              <div className="space-y-2">
                <Label htmlFor="familyNameKana">姓（カナ） *</Label>
                <Input
                  id="familyNameKana"
                  type="text"
                  inputMode="text"
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
                  inputMode="text"
                  value={formData.givenNameKana}
                  onChange={(e) => setFormData({ ...formData, givenNameKana: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid max-w-md grid-cols-1 gap-4">
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
              <div className="space-y-3">
                <Label id="sex-label">性別 *</Label>
                <RadioGroup
                  value={formData.sex}
                  onValueChange={(value) =>
                    setFormData({ ...formData, sex: value as "MALE" | "FEMALE" | "OTHER" })
                  }
                  className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2"
                  aria-labelledby="sex-label"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="MALE" id="male" />
                    <Label htmlFor="male" className="cursor-pointer font-normal">
                      男性
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="FEMALE" id="female" />
                    <Label htmlFor="female" className="cursor-pointer font-normal">
                      女性
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="OTHER" id="other" />
                    <Label htmlFor="other" className="cursor-pointer font-normal">
                      その他
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
      </FormSection>

      <FormSection
        icon={MapPin}
        title="住所"
        description="郵便番号を入力すると、都道府県・市区町村・町域を自動で埋めることがあります。"
      >
            <div className="max-w-xs space-y-2">
              <Label htmlFor="postalCode">郵便番号 *</Label>
              <Input
                id="postalCode"
                name="postalCode"
                type="text"
                inputMode="numeric"
                numericInput="integer"
                placeholder="1234567"
                maxLength={7}
                autoComplete="postal-code"
                value={formData.postalCode}
                onChange={(e) => handlePostalCodeChange(e.target.value)}
                required
              />
              <p className={fieldHintClass("compact")}>ハイフンなし7桁</p>
            </div>

            <div className={fieldGrid}>
              <div className="space-y-2">
                <Label htmlFor="prefecture">都道府県 *</Label>
                <Input
                  id="prefecture"
                  type="text"
                  autoComplete="address-level1"
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
                  autoComplete="address-level2"
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
                autoComplete="street-address"
                value={formData.addressLine1}
                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="addressLine2">建物名・部屋番号</Label>
              <Input
                id="addressLine2"
                type="text"
                autoComplete="address-line2"
                value={formData.addressLine2}
                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
              />
            </div>
      </FormSection>

      <FormSection
        icon={Phone}
        title="緊急連絡先"
        description="任意です。大会や災害時の連絡先として利用することがあります。"
      >
            <div className={fieldGrid}>
              <div className="space-y-2">
                <Label htmlFor="emergencyContactFamilyName">姓</Label>
                <Input
                  id="emergencyContactFamilyName"
                  type="text"
                  placeholder="山田"
                  value={formData.emergencyContactFamilyName}
                  onChange={(e) =>
                    setFormData({ ...formData, emergencyContactFamilyName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyContactGivenName">名</Label>
                <Input
                  id="emergencyContactGivenName"
                  type="text"
                  placeholder="花子"
                  value={formData.emergencyContactGivenName}
                  onChange={(e) =>
                    setFormData({ ...formData, emergencyContactGivenName: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="max-w-md">
              <PhoneNumberField
                id="emergencyContactPhone"
                label="電話番号"
                value={formData.emergencyContactPhone}
                onChange={(emergencyContactPhone) =>
                  setFormData({ ...formData, emergencyContactPhone })
                }
              />
            </div>
      </FormSection>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/55 bg-muted/20 px-5 py-4 sm:px-6",
          "flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        )}
      >
        <p className="text-center text-xs text-muted-foreground sm:text-left sm:text-sm">
          内容を変更したあと、「変更を保存」で反映されます。
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
            className="w-full sm:w-auto sm:min-w-[7rem]"
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={loading} className="w-full sm:w-auto sm:min-w-[10rem]">
            {loading ? "保存中..." : "変更を保存"}
          </Button>
        </div>
      </div>
    </AutofillSyncForm>
  );
}
