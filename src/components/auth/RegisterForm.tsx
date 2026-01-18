"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    phoneNumber: "",
    jlaMemberNumber: "",
    emergencyContactFamilyName: "",
    emergencyContactGivenName: "",
    emergencyContactFamilyNameKana: "",
    emergencyContactGivenNameKana: "",
    emergencyContactPhone: "",
  });

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
          phoneNumber: formData.phoneNumber || undefined,
          jlaMemberNumber: formData.jlaMemberNumber || undefined,
          emergencyContactFamilyName: formData.emergencyContactFamilyName || undefined,
          emergencyContactGivenName: formData.emergencyContactGivenName || undefined,
          emergencyContactFamilyNameKana: formData.emergencyContactFamilyNameKana || undefined,
          emergencyContactGivenNameKana: formData.emergencyContactGivenNameKana || undefined,
          emergencyContactPhone: formData.emergencyContactPhone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "登録に失敗しました");
        return;
      }

      toast.success("登録が完了しました。ログインしてください。");
      router.push("/login");
    } catch (err) {
      console.error("Register error:", err);
      toast.error("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>新規登録</CardTitle>
        <CardDescription>
          JLA PFアカウントを作成してください
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
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
              <Label htmlFor="familyName">姓</Label>
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
              <Label htmlFor="givenName">名</Label>
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
              <Label htmlFor="familyNameKana">姓（カナ）</Label>
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
              <Label htmlFor="givenNameKana">名（カナ）</Label>
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
            <Label htmlFor="dateOfBirth">生年月日</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">電話番号</Label>
            <Input
              id="phoneNumber"
              type="tel"
              placeholder="09012345678"
              maxLength={11}
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/[^\d]/g, '') })}
            />
            <p className="text-xs text-muted-foreground">携帯電話番号（ハイフンなし11桁）重複登録防止のため推奨</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jlaMemberNumber">JLA会員番号（任意）</Label>
            <Input
              id="jlaMemberNumber"
              type="text"
              placeholder="既にJLA会員の方は入力"
              value={formData.jlaMemberNumber}
              onChange={(e) => setFormData({ ...formData, jlaMemberNumber: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContactFamilyName">緊急連絡先姓（任意）</Label>
              <Input
                id="emergencyContactFamilyName"
                type="text"
                placeholder="山田"
                value={formData.emergencyContactFamilyName}
                onChange={(e) => setFormData({ ...formData, emergencyContactFamilyName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactGivenName">緊急連絡先名（任意）</Label>
              <Input
                id="emergencyContactGivenName"
                type="text"
                placeholder="花子"
                value={formData.emergencyContactGivenName}
                onChange={(e) => setFormData({ ...formData, emergencyContactGivenName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContactFamilyNameKana">緊急連絡先姓カナ（任意）</Label>
              <Input
                id="emergencyContactFamilyNameKana"
                type="text"
                placeholder="ヤマダ"
                value={formData.emergencyContactFamilyNameKana}
                onChange={(e) => setFormData({ ...formData, emergencyContactFamilyNameKana: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactGivenNameKana">緊急連絡先名カナ（任意）</Label>
              <Input
                id="emergencyContactGivenNameKana"
                type="text"
                placeholder="ハナコ"
                value={formData.emergencyContactGivenNameKana}
                onChange={(e) => setFormData({ ...formData, emergencyContactGivenNameKana: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emergencyContactPhone">緊急連絡先電話番号（任意）</Label>
            <Input
              id="emergencyContactPhone"
              type="tel"
              placeholder="09012345678"
              maxLength={11}
              value={formData.emergencyContactPhone}
              onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/[^\d]/g, '') })}
            />
            <p className="text-xs text-muted-foreground">ハイフンなし11桁</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
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
            <Label htmlFor="confirmPassword">パスワード（確認）</Label>
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
            {loading ? "登録中..." : "登録"}
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
