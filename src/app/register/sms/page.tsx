"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export default function SMSRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    phoneNumber: "",
    familyName: "",
    givenName: "",
    familyNameKana: "",
    givenNameKana: "",
    dateOfBirth: "",
    sex: "MALE" as "MALE" | "FEMALE" | "OTHER",
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
    email: "",
    password: "",
  });

  // 郵便番号から住所自動補完
  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, postalCode });

    if (postalCode.length === 7) {
      try {
        // zipcloud APIで住所取得
        const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
        const data = await res.json();
        
        if (data.results && data.results[0]) {
          const result = data.results[0];
          setFormData(prev => ({
            ...prev,
            prefecture: result.address1,
            city: result.address2,
            addressLine1: result.address3,
          }));
          toast.success("住所を自動入力しました");
        }
      } catch (error) {
        console.error("Failed to fetch address:", error);
        // エラーでも継続可能
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[DEBUG] Form submitted:', formData);
    setLoading(true);

    try {
      console.log('[DEBUG] Sending request to /api/registration/start');
      const res = await fetch("/api/registration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      console.log('[DEBUG] Response status:', res.status);
      const data = await res.json();
      console.log('[DEBUG] Response data:', data);

      if (!res.ok) {
        console.error('[DEBUG] Error response:', data);
        // 詳細なエラー情報を表示
        if (data.details && Array.isArray(data.details)) {
          console.error('[DEBUG] Validation errors:', data.details);
          const errorMessages = data.details.map((err: any) => 
            `${err.path?.join('.')} - ${err.message}`
          ).join('\n');
          toast.error(`入力エラー:\n${errorMessages}`);
        } else {
          toast.error(data.error || "登録に失敗しました");
        }
        return;
      }

      // OTP入力ページへ遷移
      router.push(`/register/sms/otp?sessionId=${data.sessionId}&phone=${encodeURIComponent(formData.phoneNumber)}`);
    } catch (err) {
      console.error("Registration start error:", err);
      toast.error("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>SMS認証 新規登録</CardTitle>
          <CardDescription>
            携帯電話番号で簡単登録
          </CardDescription>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              <strong>💡 セキュリティのため推奨</strong><br />
              電話番号が使えなくなった場合に備えて、メールアドレスとパスワードの設定を強くお勧めします。
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">携帯電話番号 *</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="09012345678"
                maxLength={11}
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/[^\d]/g, '') })}
                required
              />
              <p className="text-xs text-muted-foreground">日本国内の携帯電話番号（070/080/090）ハイフンなし11桁</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
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
                className="flex gap-4"
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
              <Label htmlFor="postalCode">郵便番号 *</Label>
              <Input
                id="postalCode"
                type="text"
                placeholder="1234567"
                maxLength={7}
                value={formData.postalCode}
                onChange={(e) => handlePostalCodeChange(e.target.value.replace(/[^\d]/g, ''))}
                required
              />
              <p className="text-xs text-muted-foreground">ハイフンなし7桁</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <p className="text-xs text-muted-foreground">番地まで入力してください（例: 神南1-2-3）</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="addressLine2">建物名・部屋番号</Label>
              <Input
                id="addressLine2"
                type="text"
                placeholder="渋谷ビル 101号室"
                value={formData.addressLine2}
                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
              />
            </div>

            <div className="border-t pt-4 mt-6">
              <h3 className="text-sm font-semibold mb-3">緊急連絡先 *</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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

                <div className="grid grid-cols-2 gap-4">
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
                    placeholder="09012345678"
                    maxLength={11}
                    value={formData.emergencyContactPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/[^\d]/g, '') })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">ハイフンなし11桁</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-6">
              <div className="mb-3 rounded-md bg-blue-50 border border-blue-200 p-3">
                <p className="text-sm text-blue-900 font-medium">
                  🔐 バックアップ用ログイン情報
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  電話番号が使えなくなった場合でもログインできます
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">メールアドレス *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">パスワード *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="8文字以上"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    メールアドレスとセットで設定すると、SMS以外でもログイン可能になります
                  </p>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "送信中..." : "SMS認証コードを送信"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
