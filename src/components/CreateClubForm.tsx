"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function CreateClubForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    nameKana: "",
    websiteUrl: "",
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
    setFormData({ ...formData, officePostalCode: postalCode });
    if (postalCode.length === 7) {
      try {
        const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
        const data = await res.json();
        if (data.results) {
          const address = data.results[0];
          setFormData(prev => ({
            ...prev,
            officePrefecture: address.address1,
            officeCity: address.address2 + address.address3,
          }));
        }
      } catch (error) {
        console.error("郵便番号検索エラー:", error);
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

      toast.success("クラブを作成しました。承認をお待ちください。");
      router.push("/clubs");
      router.refresh();
    } catch (err) {
      console.error("Create club error:", err);
      toast.error("クラブの作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本情報セクション */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 border-b pb-2">
              基本情報
            </h3>
            
            {/* クラブ名 */}
            <div className="space-y-2">
              <Label htmlFor="name">クラブ名 *</Label>
              <Input
                id="name"
                type="text"
                placeholder="例: 東京ライフセービングクラブ"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {/* クラブ名カナ */}
            <div className="space-y-2">
              <Label htmlFor="nameKana">クラブ名カナ</Label>
              <Input
                id="nameKana"
                type="text"
                placeholder="例: トウキョウライフセービングクラブ"
                value={formData.nameKana}
                onChange={(e) => setFormData({ ...formData, nameKana: e.target.value })}
              />
            </div>

            {/* クラブURL */}
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">クラブURL</Label>
              <Input
                id="websiteUrl"
                type="url"
                placeholder="https://example.com"
                value={formData.websiteUrl}
                onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
              />
            </div>

            {/* 監視場所 */}
            <div className="space-y-2">
              <Label htmlFor="patrolLocation">監視場所</Label>
              <Input
                id="patrolLocation"
                type="text"
                placeholder="例: 湘南海岸"
                value={formData.patrolLocation}
                onChange={(e) => setFormData({ ...formData, patrolLocation: e.target.value })}
              />
            </div>

            {/* クラブ設立年 */}
            <div className="space-y-2">
              <Label htmlFor="establishedYear">クラブ設立年</Label>
              <Input
                id="establishedYear"
                type="number"
                placeholder="例: 2000"
                min="1900"
                max={new Date().getFullYear()}
                value={formData.establishedYear}
                onChange={(e) => setFormData({ ...formData, establishedYear: e.target.value })}
              />
            </div>
          </div>

          {/* 事務局情報セクション */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 border-b pb-2">
              事務局情報
            </h3>

            {/* 事務局郵便番号 */}
            <div className="space-y-2">
              <Label htmlFor="officePostalCode">事務局郵便番号</Label>
              <Input
                id="officePostalCode"
                type="text"
                placeholder="例: 1500001"
                maxLength={7}
                value={formData.officePostalCode}
                onChange={(e) => handleOfficePostalCodeChange(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>

            {/* 事務局都道府県 */}
            <div className="space-y-2">
              <Label htmlFor="officePrefecture">都道府県</Label>
              <Input
                id="officePrefecture"
                type="text"
                placeholder="例: 東京都"
                value={formData.officePrefecture}
                onChange={(e) => setFormData({ ...formData, officePrefecture: e.target.value })}
              />
            </div>

            {/* 事務局市区町村 */}
            <div className="space-y-2">
              <Label htmlFor="officeCity">市区町村</Label>
              <Input
                id="officeCity"
                type="text"
                placeholder="例: 渋谷区"
                value={formData.officeCity}
                onChange={(e) => setFormData({ ...formData, officeCity: e.target.value })}
              />
            </div>

            {/* 事務局番地 */}
            <div className="space-y-2">
              <Label htmlFor="officeAddressLine1">番地</Label>
              <Input
                id="officeAddressLine1"
                type="text"
                placeholder="例: 神南1-2-3"
                value={formData.officeAddressLine1}
                onChange={(e) => setFormData({ ...formData, officeAddressLine1: e.target.value })}
              />
            </div>

            {/* 事務局建物名・部屋番号 */}
            <div className="space-y-2">
              <Label htmlFor="officeAddressLine2">建物名・部屋番号</Label>
              <Input
                id="officeAddressLine2"
                type="text"
                placeholder="例: ○○ビル5階"
                value={formData.officeAddressLine2}
                onChange={(e) => setFormData({ ...formData, officeAddressLine2: e.target.value })}
              />
            </div>

            {/* 事務局電話番号 */}
            <div className="space-y-2">
              <Label htmlFor="officePhone">事務局電話番号</Label>
              <Input
                id="officePhone"
                type="tel"
                placeholder="例: 0312345678"
                maxLength={11}
                value={formData.officePhone}
                onChange={(e) => setFormData({ ...formData, officePhone: e.target.value.replace(/[^0-9]/g, '') })}
              />
              <p className="text-xs text-muted-foreground">ハイフンなし10〜11桁で入力してください</p>
            </div>

            {/* 郵便物の宛名 */}
            <div className="space-y-2">
              <Label htmlFor="mailingName">郵便物の宛名</Label>
              <Input
                id="mailingName"
                type="text"
                placeholder="例: 東京ライフセービングクラブ事務局"
                value={formData.mailingName}
                onChange={(e) => setFormData({ ...formData, mailingName: e.target.value })}
              />
            </div>
          </div>

          {/* 注意事項 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              📋 クラブ作成について
            </h3>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>クラブ作成後、JLAの承認が必要です</li>
              <li>承認されるまでクラブは「申請中」状態となります</li>
              <li>あなたは自動的にクラブのオーナーとして登録されます</li>
              <li>*マークのついた項目は必須です</li>
            </ul>
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
              {loading ? "作成中..." : "クラブを作成"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
