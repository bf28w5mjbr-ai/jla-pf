"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

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

export default function EditProfileForm({ user }: EditProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    familyName: user.familyName,
    givenName: user.givenName,
    familyNameKana: user.familyNameKana,
    givenNameKana: user.givenNameKana,
    dateOfBirth: new Date(user.dateOfBirth).toISOString().split('T')[0],
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

  // 郵便番号から住所自動補完
  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, postalCode });

    if (postalCode.length === 7) {
      try {
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

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 氏名 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="familyName">姓 *</Label>
              <Input
                id="familyName"
                type="text"
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
                value={formData.givenName}
                onChange={(e) => setFormData({ ...formData, givenName: e.target.value })}
                required
              />
            </div>
          </div>

          {/* カナ */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="familyNameKana">姓（カナ） *</Label>
              <Input
                id="familyNameKana"
                type="text"
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
                value={formData.givenNameKana}
                onChange={(e) => setFormData({ ...formData, givenNameKana: e.target.value })}
                required
              />
            </div>
          </div>

          {/* 生年月日 */}
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

          {/* 性別 */}
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

          {/* 郵便番号 */}
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

          {/* 都道府県・市区町村 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prefecture">都道府県 *</Label>
              <Input
                id="prefecture"
                type="text"
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
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>
          </div>

          {/* 町名・番地 */}
          <div className="space-y-2">
            <Label htmlFor="addressLine1">町名・番地 *</Label>
            <Input
              id="addressLine1"
              type="text"
              value={formData.addressLine1}
              onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
              required
            />
          </div>

          {/* 建物名・部屋番号 */}
          <div className="space-y-2">
            <Label htmlFor="addressLine2">建物名・部屋番号</Label>
            <Input
              id="addressLine2"
              type="text"
              value={formData.addressLine2}
              onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
            />
          </div>

          {/* 緊急連絡先 */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold mb-4">緊急連絡先（任意）</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactFamilyName">緊急連絡先 姓</Label>
                  <Input
                    id="emergencyContactFamilyName"
                    type="text"
                    placeholder="山田"
                    value={formData.emergencyContactFamilyName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactFamilyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactGivenName">緊急連絡先 名</Label>
                  <Input
                    id="emergencyContactGivenName"
                    type="text"
                    placeholder="花子"
                    value={formData.emergencyContactGivenName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactGivenName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyContactPhone">緊急連絡先電話番号</Label>
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
            </div>
          </div>

          {/* ボタン */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "更新中..." : "更新"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
