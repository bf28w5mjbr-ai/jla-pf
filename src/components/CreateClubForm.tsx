"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/auth/FormSection";
import { fieldHintClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function CreateClubForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    nameKana: "",
    abbreviation: "",
    websiteUrl: "",
    isLifesavingClub: false,
    patrolLocation: "",
    establishedYear: "",
    officePostalCode: "",
    officePrefecture: "",
    officeCity: "",
    officeAddressLine1: "",
    officeAddressLine2: "",
    officePhone: "",
    mailingName: "",
  });

  const handleOfficePostalCodeChange = async (postalCode: string) => {
    setFormData((prev) => ({ ...prev, officePostalCode: postalCode }));
    if (postalCode.length === 7) {
      try {
        const res = await fetch(`/api/postal-code?zipcode=${postalCode}`);
        const data = await res.json();
        if (data.results?.[0]) {
          const address = data.results[0];
          setFormData((prev) => ({
            ...prev,
            officePrefecture: address.address1,
            officeCity: `${address.address2 ?? ""}${address.address3 ?? ""}`,
          }));
          toast.success("住所を自動入力しました");
        } else {
          toast.message("該当する住所が見つかりませんでした", {
            description: "都道府県・市区町村を手入力してください。",
          });
        }
      } catch (error) {
        console.error("郵便番号検索エラー:", error);
        toast.error("住所の自動入力に失敗しました");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/clubs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "クラブの作成に失敗しました");
        return;
      }

      toast.success("クラブを作成しました");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Create club error:", err);
      toast.error("クラブの作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <FormSection
        title="基本情報"
        description="公開プロフィールに表示される名称です。"
        descriptionDensity="balanced"
      >
        <div className="space-y-2">
          <Label htmlFor="name">クラブ名 *</Label>
          <Input
            id="name"
            type="text"
            placeholder="例: 東京〇〇クラブ"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nameKana">クラブ名カナ</Label>
            <Input
              id="nameKana"
              type="text"
              placeholder="例: トウキョウ〇〇クラブ"
              value={formData.nameKana}
              onChange={(e) => setFormData((prev) => ({ ...prev, nameKana: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="abbreviation">略称</Label>
            <Input
              id="abbreviation"
              type="text"
              placeholder="例: TLSC"
              maxLength={20}
              value={formData.abbreviation}
              onChange={(e) => setFormData((prev) => ({ ...prev, abbreviation: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="websiteUrl">クラブURL</Label>
          <Input
            id="websiteUrl"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            value={formData.websiteUrl}
            onChange={(e) => setFormData((prev) => ({ ...prev, websiteUrl: e.target.value }))}
          />
        </div>

        <div className="space-y-2 sm:max-w-xs">
          <Label htmlFor="establishedYear">設立年</Label>
          <Input
            id="establishedYear"
            numericInput="integer"
            placeholder="例: 2000"
            min={1900}
            max={new Date().getFullYear()}
            value={formData.establishedYear}
            onChange={(e) => setFormData((prev) => ({ ...prev, establishedYear: e.target.value }))}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 rounded border-input"
              checked={formData.isLifesavingClub}
              onChange={(e) => {
                const checked = e.target.checked;
                setFormData((prev) => ({
                  ...prev,
                  isLifesavingClub: checked,
                  patrolLocation: checked ? prev.patrolLocation : "",
                }));
              }}
            />
            <span className="text-sm leading-relaxed">
              <span className="font-medium text-foreground">ライフセービングクラブである</span>
              <span className={cn(fieldHintClass("guided"), "block")}>
                チェックすると、監視活動の場所（監視場所）を登録できます。カヌー・サーフィンなど他種目のクラブの場合はオフのままにしてください。
              </span>
            </span>
          </label>
          {formData.isLifesavingClub && (
            <div className="space-y-2 pt-1">
              <Label htmlFor="patrolLocation">監視場所</Label>
              <Input
                id="patrolLocation"
                type="text"
                placeholder="例: 湘南海岸〇〇海水浴場"
                value={formData.patrolLocation}
                onChange={(e) => setFormData((prev) => ({ ...prev, patrolLocation: e.target.value }))}
              />
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        title="事務局"
        description="連絡・郵送に使う住所と電話番号です。郵便番号を入力すると住所の一部を自動入力できます。"
        descriptionDensity="guided"
      >
        <div className="space-y-2">
          <Label htmlFor="officePostalCode">事務局 郵便番号</Label>
          <Input
            id="officePostalCode"
            type="text"
            numericInput="integer"
            placeholder="1500001"
            maxLength={7}
            value={formData.officePostalCode}
            onChange={(e) => handleOfficePostalCodeChange(e.target.value)}
          />
          <p className={fieldHintClass("compact")}>ハイフンなし7桁</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="officePrefecture">都道府県</Label>
            <Input
              id="officePrefecture"
              type="text"
              placeholder="東京都"
              value={formData.officePrefecture}
              onChange={(e) => setFormData((prev) => ({ ...prev, officePrefecture: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="officeCity">市区町村</Label>
            <Input
              id="officeCity"
              type="text"
              placeholder="渋谷区"
              value={formData.officeCity}
              onChange={(e) => setFormData((prev) => ({ ...prev, officeCity: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="officeAddressLine1">町名・番地</Label>
          <Input
            id="officeAddressLine1"
            type="text"
            placeholder="神南1-2-3"
            value={formData.officeAddressLine1}
            onChange={(e) => setFormData((prev) => ({ ...prev, officeAddressLine1: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="officeAddressLine2">建物名・部屋番号</Label>
          <Input
            id="officeAddressLine2"
            type="text"
            placeholder="○○ビル5階"
            value={formData.officeAddressLine2}
            onChange={(e) => setFormData((prev) => ({ ...prev, officeAddressLine2: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="officePhone">事務局電話番号</Label>
          <Input
            id="officePhone"
            type="tel"
            numericInput="integer"
            placeholder="0312345678"
            maxLength={11}
            value={formData.officePhone}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                officePhone: e.target.value,
              }))
            }
          />
          <p className={fieldHintClass("compact")}>ハイフンなし10〜11桁で入力してください</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mailingName">郵便物の宛名</Label>
          <Input
            id="mailingName"
            type="text"
            placeholder="〇〇クラブ 事務局"
            value={formData.mailingName}
            onChange={(e) => setFormData((prev) => ({ ...prev, mailingName: e.target.value }))}
          />
        </div>
      </FormSection>

      <div
        className="flex gap-3 rounded-xl border border-orange-200/80 bg-orange-50/80 p-4 dark:border-orange-900/50 dark:bg-orange-950/30"
        role="note"
      >
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-300" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-orange-950 dark:text-orange-100">作成について</p>
          <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-orange-900/90 dark:text-orange-200/95">
            <li>
              クラブは<span className="font-semibold">送信後すぐに成立</span>
              します。第三者の承認を待ってから「クラブになる」わけではありません。
            </li>
            <li>作成者はクラブの管理者として登録されます。</li>
            <li>「*」の項目は必須です。</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
          className="sm:min-w-[120px]"
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={loading} className="sm:min-w-[140px]">
          {loading ? "作成中…" : "クラブを作成"}
        </Button>
      </div>
    </form>
  );
}
