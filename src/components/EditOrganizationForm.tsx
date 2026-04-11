"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { toHalfWidthDigits } from "@/lib/numericInput";

type Organization = {
  id: string;
  name: string;
  nameKana: string | null;
  abbreviation: string | null;
  websiteUrl: string | null;
  email: string | null;
  phoneNumber: string | null;
  representativeFamilyName: string | null;
  representativeGivenName: string | null;
  representativeFamilyNameKana: string | null;
  representativeGivenNameKana: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  description: string | null;
  establishedYear: number | null;
};

type EditOrganizationFormProps = {
  organization: Organization;
};

export default function EditOrganizationForm({
  organization,
}: EditOrganizationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // 基本情報
  const [name, setName] = useState(organization.name);
  const [nameKana, setNameKana] = useState(organization.nameKana || "");
  const [abbreviation, setAbbreviation] = useState(organization.abbreviation || "");
  const [websiteUrl, setWebsiteUrl] = useState(organization.websiteUrl || "");
  const [email, setEmail] = useState(organization.email || "");
  const [phoneNumber, setPhoneNumber] = useState(organization.phoneNumber || "");

  // 代表者情報
  const [representativeFamilyName, setRepresentativeFamilyName] = useState(
    organization.representativeFamilyName || ""
  );
  const [representativeGivenName, setRepresentativeGivenName] = useState(
    organization.representativeGivenName || ""
  );
  const [representativeFamilyNameKana, setRepresentativeFamilyNameKana] = useState(
    organization.representativeFamilyNameKana || ""
  );
  const [representativeGivenNameKana, setRepresentativeGivenNameKana] = useState(
    organization.representativeGivenNameKana || ""
  );

  // 事務局住所
  const [postalCode, setPostalCode] = useState(organization.postalCode || "");
  const [prefecture, setPrefecture] = useState(organization.prefecture || "");
  const [city, setCity] = useState(organization.city || "");
  const [addressLine1, setAddressLine1] = useState(organization.addressLine1 || "");
  const [addressLine2, setAddressLine2] = useState(organization.addressLine2 || "");

  // 詳細情報
  const [description, setDescription] = useState(organization.description || "");
  const [establishedYear, setEstablishedYear] = useState(
    organization.establishedYear?.toString() || ""
  );

  // 郵便番号から住所を自動入力
  const handlePostalCodeChange = async (value: string) => {
    setPostalCode(value);

    const cleanedCode = value.replace(/-/g, "");

    if (cleanedCode.length === 7) {
      try {
        const response = await fetch(`/api/postal-code?zipcode=${cleanedCode}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
          const result = data.results[0];
          setPrefecture(result.address1);
          setCity(result.address2 + result.address3);
        }
      } catch (error) {
        console.error("郵便番号検索エラー:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("団体名を入力してください");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/organizations/${organization.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nameKana,
          abbreviation,
          websiteUrl,
          email,
          phoneNumber,
          representativeFamilyName,
          representativeGivenName,
          representativeFamilyNameKana,
          representativeGivenNameKana,
          postalCode,
          prefecture,
          city,
          addressLine1,
          addressLine2,
          description,
          establishedYear,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "団体の更新に失敗しました");
      }

      toast.success("団体情報を更新しました");
      router.push(`/organizations/${organization.id}`);
      router.refresh();
    } catch (error) {
      console.error("Update organization error:", error);
      toast.error(
        error instanceof Error ? error.message : "団体の更新に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AutofillSyncForm onSubmit={handleSubmit} className="space-y-6">
      {/* 基本情報 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">基本情報</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">
              団体名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 日本ライフセービング協会"
              required
            />
          </div>

          <div>
            <Label htmlFor="nameKana">団体名（カナ）</Label>
            <Input
              id="nameKana"
              value={nameKana}
              onChange={(e) => setNameKana(e.target.value)}
              placeholder="例: ニホンライフセービングキョウカイ"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="abbreviation">略称</Label>
              <Input
                id="abbreviation"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                placeholder="例: JLA"
              />
            </div>

            <div>
              <Label htmlFor="establishedYear">設立年</Label>
              <Input
                id="establishedYear"
                numericInput="integer"
                min="1900"
                max={new Date().getFullYear()}
                value={establishedYear}
                onChange={(e) => setEstablishedYear(e.target.value)}
                placeholder="例: 1991"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="websiteUrl">ウェブサイトURL</Label>
            <Input
              id="websiteUrl"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@example.com"
              />
            </div>

            <div>
              <Label htmlFor="phoneNumber">電話番号</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(toHalfWidthDigits(e.target.value))}
                placeholder="03-1234-5678"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">団体説明</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="団体の活動内容や目的を入力してください"
              rows={4}
            />
          </div>
        </div>
      </Card>

      {/* 代表者情報 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">代表者情報</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="representativeFamilyName">代表者姓</Label>
              <Input
                id="representativeFamilyName"
                value={representativeFamilyName}
                onChange={(e) => setRepresentativeFamilyName(e.target.value)}
                placeholder="山田"
              />
            </div>

            <div>
              <Label htmlFor="representativeGivenName">代表者名</Label>
              <Input
                id="representativeGivenName"
                value={representativeGivenName}
                onChange={(e) => setRepresentativeGivenName(e.target.value)}
                placeholder="太郎"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="representativeFamilyNameKana">代表者姓（カナ）</Label>
              <Input
                id="representativeFamilyNameKana"
                value={representativeFamilyNameKana}
                onChange={(e) => setRepresentativeFamilyNameKana(e.target.value)}
                placeholder="ヤマダ"
              />
            </div>

            <div>
              <Label htmlFor="representativeGivenNameKana">代表者名（カナ）</Label>
              <Input
                id="representativeGivenNameKana"
                value={representativeGivenNameKana}
                onChange={(e) => setRepresentativeGivenNameKana(e.target.value)}
                placeholder="タロウ"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 事務局住所 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">事務局住所</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="postalCode">郵便番号</Label>
            <Input
              id="postalCode"
              numericInput="integer"
              value={postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              placeholder="1234567（ハイフンなし）"
              maxLength={7}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prefecture">都道府県</Label>
              <Input
                id="prefecture"
                value={prefecture}
                onChange={(e) => setPrefecture(e.target.value)}
                placeholder="東京都"
              />
            </div>

            <div>
              <Label htmlFor="city">市区町村</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="渋谷区"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="addressLine1">町名・番地</Label>
            <Input
              id="addressLine1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="神南1-2-3"
            />
          </div>

          <div>
            <Label htmlFor="addressLine2">建物名・部屋番号</Label>
            <Input
              id="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="〇〇ビル 4階"
            />
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? "更新中..." : "変更を保存"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          キャンセル
        </Button>
      </div>
    </AutofillSyncForm>
  );
}
