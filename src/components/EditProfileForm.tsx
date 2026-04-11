"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { fieldHintClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";

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
        "rounded-2xl border border-border/80 bg-card/50 p-5 shadow-sm sm:p-6 dark:bg-card/30",
        className
      )}
    >
      <div className="mb-5 flex gap-3 border-b border-border/60 pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
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
    <Card padding="none" className="overflow-hidden border-border/90 shadow-md">
      <CardHeader className="border-b border-border/80 bg-muted/25 px-5 py-5 sm:px-6">
        <CardTitle className="text-lg">入力フォーム</CardTitle>
        <CardDescription>
          内容を変更したあと、「変更を保存」で反映されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 p-5 sm:p-6">
        <AutofillSyncForm onSubmit={handleSubmit} className="space-y-8">
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
            <div className="max-w-md space-y-2">
              <Label htmlFor="emergencyContactPhone">電話番号</Label>
              <Input
                id="emergencyContactPhone"
                type="tel"
                inputMode="numeric"
                numericInput="integer"
                placeholder="09012345678"
                maxLength={11}
                autoComplete="tel"
                value={formData.emergencyContactPhone}
                onChange={(e) =>
                  setFormData({ ...formData, emergencyContactPhone: e.target.value })
                }
              />
              <p className={fieldHintClass("compact")}>ハイフンなし11桁</p>
            </div>
          </FormSection>

          <div className="flex flex-col-reverse gap-3 border-t border-border/80 pt-6 sm:flex-row sm:justify-end sm:gap-3">
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
        </AutofillSyncForm>
      </CardContent>
    </Card>
  );
}
