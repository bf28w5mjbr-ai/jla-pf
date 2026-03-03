"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import Link from "next/link";

export default function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
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
    jlaMemberNumber: "",
    emergencyContactFamilyName: "",
    emergencyContactGivenName: "",
    emergencyContactFamilyNameKana: "",
    emergencyContactGivenNameKana: "",
    emergencyContactPhone: "",
  });

  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, postalCode });

    if (postalCode.length === 7) {
      try {
        const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
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
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("パスワードが一致しません");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
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
          jlaMemberNumber: formData.jlaMemberNumber,
          emergencyContactFamilyName: formData.emergencyContactFamilyName,
          emergencyContactGivenName: formData.emergencyContactGivenName,
          emergencyContactFamilyNameKana: formData.emergencyContactFamilyNameKana,
          emergencyContactGivenNameKana: formData.emergencyContactGivenNameKana,
          emergencyContactPhone: formData.emergencyContactPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "登録に失敗しました");
        return;
      }

      if (!data?.userId) {
        toast.error("登録後の処理に失敗しました");
        return;
      }

      toast.success("登録が完了しました。パスキー登録へ進みます。");
      router.push(`/register/passkey?userId=${data.userId}&phone=${encodeURIComponent(formData.phoneNumber)}`);
    } catch (err) {
      console.error("Register error:", err);
      toast.error("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>新規登録（必須情報の入力）</CardTitle>
        <CardDescription>
          全項目必須です。登録後にパスキー登録へ進みます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="phoneNumber">電話番号 *</Label>
            <Input
              id="phoneNumber"
              type="tel"
              placeholder="09012345678"
              maxLength={11}
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/[^\d]/g, '') })}
              required
            />
            <p className="text-xs text-muted-foreground">携帯電話番号（ハイフンなし11桁）</p>
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
            <Label htmlFor="addressLine2">建物名・部屋番号（任意）</Label>
            <Input
              id="addressLine2"
              type="text"
              placeholder="渋谷ビル 101号室"
              value={formData.addressLine2}
              onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jlaMemberNumber">JLA会員番号（任意）</Label>
            <Input
              id="jlaMemberNumber"
              type="text"
              placeholder="5000から始まる9桁（例: 500012345）"
              value={formData.jlaMemberNumber}
              onChange={(e) => setFormData({ ...formData, jlaMemberNumber: e.target.value })}
              inputMode="numeric"
              maxLength={9}
            />
            <p className="text-xs text-muted-foreground">
              5000から始まる9桁番号を入力してください
            </p>
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

          <div className="space-y-2">
            <Label htmlFor="password">パスワード *</Label>
            <Input
              id="password"
              type="password"
              placeholder="8文字以上"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">パスワード（確認） *</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="パスワードを再入力"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登録中..." : "次へ（パスキー登録）"}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            既にアカウントをお持ちですか？{" "}
            <Link href="/login" className="text-primary hover:underline">
              ログイン
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
