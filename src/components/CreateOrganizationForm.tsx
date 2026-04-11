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
import { pageIntroTextClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";

type CreateOrganizationFormProps = {
  onboardingFeeAmount: number;
};

export default function CreateOrganizationForm({
  onboardingFeeAmount,
}: CreateOrganizationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const formattedFee = new Intl.NumberFormat("ja-JP").format(onboardingFeeAmount);

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
      toast.error("大会主催団体名を入力してください");
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
        throw new Error(data.error || "大会主催団体の作成に失敗しました");
      }

      const organization = await response.json();
      toast.success("大会主催団体を作成しました。支払い完了後に正式化されます");
      router.push(`/organizations/${organization.id}`);
    } catch (error) {
      console.error("Create organization error:", error);
      toast.error(
        error instanceof Error ? error.message : "大会主催団体の作成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AutofillSyncForm onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">大会主催団体を作成</h1>
        <p className={cn(pageIntroTextClass("guided"), "mt-1")}>
          大会主催団体の基本情報と連絡先を登録します。作成後は支払い完了で正式に有効化されます。
        </p>
      </div>

      <Card className="border-amber-300 bg-amber-50/80 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
        <h2 className="mb-4 text-lg font-semibold text-foreground">作成前に確認すること</h2>
        <div className="space-y-4 text-sm leading-6 text-slate-700">
          <div>
            <p className="font-semibold text-slate-900">開催者の成立条件</p>
            <p>
              開催者は作成直後に利用開始状態にはならず、まず
              <span className="font-semibold"> 仮状態 </span>
              で作成されます。年額のプラットフォーム利用料の登録完了後に正式な大会開催者として扱われます。
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-900">課金情報</p>
            <p>
              現在の年額利用料は
              <span className="font-semibold"> {formattedFee}円 </span>
              です。作成後、団体詳細画面から Stripe で年額プランに登録し、完了後に正式化されます。
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-900">作成時点でできること</p>
            <p>
              基本情報の登録、代表者の設定、管理者としての初期登録は作成時点で行われます。大会運営の正式利用は、支払い完了後を前提とします。
            </p>
          </div>
        </div>
      </Card>

      {/* 基本情報 */}
      <Card className="p-6">
        <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold text-foreground">基本情報</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">
              大会主催団体名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 日本ライフセービング協会"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="nameKana">大会主催団体名（カナ）</Label>
              <Input
                id="nameKana"
                value={nameKana}
                onChange={(e) => setNameKana(e.target.value)}
                placeholder="例: ニホンライフセービングキョウカイ"
              />
            </div>
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              placeholder="大会主催団体の活動内容や目的を入力してください"
              rows={4}
            />
          </div>
        </div>
      </Card>

      {/* 事務局住所 */}
      <Card className="p-6">
        <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold text-foreground">事務局住所</h2>
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
          className="w-full sm:w-auto sm:min-w-[120px]"
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={loading} className="w-full sm:w-auto sm:min-w-[160px]">
          {loading ? "作成中..." : "大会主催団体を作成"}
        </Button>
      </div>
    </AutofillSyncForm>
  );
}
