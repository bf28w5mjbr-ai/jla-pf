"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export default function CreateOrganizationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // 基本情報
  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // 事務局住所
  const [postalCode, setPostalCode] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [city, setCity] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");

  // 詳細情報
  const [description, setDescription] = useState("");
  const [establishedYear, setEstablishedYear] = useState("");

  // 郵便番号から住所を自動入力
  const handlePostalCodeChange = async (value: string) => {
    setPostalCode(value);

    // ハイフンを除去して7桁の数字のみにする
    const cleanedCode = value.replace(/-/g, "");

    if (cleanedCode.length === 7) {
      try {
        const response = await fetch(
          `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanedCode}`
        );
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

      const response = await fetch("/api/organizations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nameKana,
          abbreviation,
          websiteUrl,
          email,
          phoneNumber,
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
        throw new Error(data.error || "団体の作成に失敗しました");
      }

      const organization = await response.json();
      toast.success("団体を作成しました");
      router.push(`/organizations/${organization.id}`);
    } catch (error) {
      console.error("Create organization error:", error);
      toast.error(
        error instanceof Error ? error.message : "団体の作成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
                type="number"
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
                onChange={(e) => setPhoneNumber(e.target.value)}
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

      {/* 事務局住所 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">事務局住所</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="postalCode">郵便番号</Label>
            <Input
              id="postalCode"
              value={postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              placeholder="1234567（ハイフンなし）"
              maxLength={8}
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
          {loading ? "作成中..." : "団体を作成"}
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
    </form>
  );
}
