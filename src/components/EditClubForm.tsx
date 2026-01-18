"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Club {
  id: string;
  name: string;
  nameKana: string | null;
  websiteUrl: string | null;
  representativeFamilyName: string | null;
  representativeGivenName: string | null;
  representativeFamilyNameKana: string | null;
  representativeGivenNameKana: string | null;
  representativePostalCode: string | null;
  representativePrefecture: string | null;
  representativeCity: string | null;
  representativeAddressLine1: string | null;
  representativeAddressLine2: string | null;
  representativePhone: string | null;
  patrolLocation: string | null;
  establishedYear: number | null;
  officePostalCode: string | null;
  officePrefecture: string | null;
  officeCity: string | null;
  officeAddressLine1: string | null;
  officeAddressLine2: string | null;
  officePhone: string | null;
  mailingName: string | null;
}

interface EditClubFormProps {
  club: Club;
}

export default function EditClubForm({ club }: EditClubFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: club.name || "",
    nameKana: club.nameKana || "",
    websiteUrl: club.websiteUrl || "",
    representativeFamilyName: club.representativeFamilyName || "",
    representativeGivenName: club.representativeGivenName || "",
    representativeFamilyNameKana: club.representativeFamilyNameKana || "",
    representativeGivenNameKana: club.representativeGivenNameKana || "",
    representativePostalCode: club.representativePostalCode || "",
    representativePrefecture: club.representativePrefecture || "",
    representativeCity: club.representativeCity || "",
    representativeAddressLine1: club.representativeAddressLine1 || "",
    representativeAddressLine2: club.representativeAddressLine2 || "",
    representativePhone: club.representativePhone || "",
    patrolLocation: club.patrolLocation || "",
    establishedYear: club.establishedYear?.toString() || "",
    officePostalCode: club.officePostalCode || "",
    officePrefecture: club.officePrefecture || "",
    officeCity: club.officeCity || "",
    officeAddressLine1: club.officeAddressLine1 || "",
    officeAddressLine2: club.officeAddressLine2 || "",
    officePhone: club.officePhone || "",
    mailingName: club.mailingName || "",
  });

  const handleRepresentativePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, representativePostalCode: postalCode });
    
    if (postalCode.length === 7) {
      try {
        const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
        const data = await res.json();
        
        if (data.results) {
          const address = data.results[0];
          setFormData(prev => ({
            ...prev,
            representativePrefecture: address.address1,
            representativeCity: address.address2 + address.address3,
          }));
        }
      } catch (error) {
        console.error("Postal code lookup error:", error);
      }
    }
  };

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
        console.error("Postal code lookup error:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/clubs/${club.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "クラブ情報の更新に失敗しました");
        return;
      }

      toast.success("クラブ情報を更新しました");
      router.push(`/clubs/${club.id}`);
      router.refresh();
    } catch (err) {
      console.error("Update club error:", err);
      toast.error("クラブ情報の更新に失敗しました");
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

          {/* 代表者情報セクション */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 border-b pb-2">
              代表者情報
            </h3>

            {/* 代表者氏名 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="representativeFamilyName">代表者姓</Label>
                <Input
                  id="representativeFamilyName"
                  type="text"
                  placeholder="例: 山田"
                  value={formData.representativeFamilyName}
                  onChange={(e) => setFormData({ ...formData, representativeFamilyName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="representativeGivenName">代表者名</Label>
                <Input
                  id="representativeGivenName"
                  type="text"
                  placeholder="例: 太郎"
                  value={formData.representativeGivenName}
                  onChange={(e) => setFormData({ ...formData, representativeGivenName: e.target.value })}
                />
              </div>
            </div>

            {/* 代表者氏名カナ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="representativeFamilyNameKana">代表者姓（カナ）</Label>
                <Input
                  id="representativeFamilyNameKana"
                  type="text"
                  placeholder="例: ヤマダ"
                  value={formData.representativeFamilyNameKana}
                  onChange={(e) => setFormData({ ...formData, representativeFamilyNameKana: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="representativeGivenNameKana">代表者名（カナ）</Label>
                <Input
                  id="representativeGivenNameKana"
                  type="text"
                  placeholder="例: タロウ"
                  value={formData.representativeGivenNameKana}
                  onChange={(e) => setFormData({ ...formData, representativeGivenNameKana: e.target.value })}
                />
              </div>
            </div>

            {/* 代表者郵便番号 */}
            <div className="space-y-2">
              <Label htmlFor="representativePostalCode">代表者郵便番号</Label>
              <Input
                id="representativePostalCode"
                type="text"
                placeholder="例: 1500001"
                maxLength={7}
                value={formData.representativePostalCode}
                onChange={(e) => handleRepresentativePostalCodeChange(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>

            {/* 代表者都道府県 */}
            <div className="space-y-2">
              <Label htmlFor="representativePrefecture">都道府県</Label>
              <Input
                id="representativePrefecture"
                type="text"
                placeholder="例: 東京都"
                value={formData.representativePrefecture}
                onChange={(e) => setFormData({ ...formData, representativePrefecture: e.target.value })}
              />
            </div>

            {/* 代表者市区町村 */}
            <div className="space-y-2">
              <Label htmlFor="representativeCity">市区町村</Label>
              <Input
                id="representativeCity"
                type="text"
                placeholder="例: 渋谷区"
                value={formData.representativeCity}
                onChange={(e) => setFormData({ ...formData, representativeCity: e.target.value })}
              />
            </div>

            {/* 代表者番地 */}
            <div className="space-y-2">
              <Label htmlFor="representativeAddressLine1">番地</Label>
              <Input
                id="representativeAddressLine1"
                type="text"
                placeholder="例: 神南1-2-3"
                value={formData.representativeAddressLine1}
                onChange={(e) => setFormData({ ...formData, representativeAddressLine1: e.target.value })}
              />
            </div>

            {/* 代表者建物名・部屋番号 */}
            <div className="space-y-2">
              <Label htmlFor="representativeAddressLine2">建物名・部屋番号</Label>
              <Input
                id="representativeAddressLine2"
                type="text"
                placeholder="例: ○○マンション101号室"
                value={formData.representativeAddressLine2}
                onChange={(e) => setFormData({ ...formData, representativeAddressLine2: e.target.value })}
              />
            </div>

            {/* 代表者電話番号 */}
            <div className="space-y-2">
              <Label htmlFor="representativePhone">代表者電話番号</Label>
              <Input
                id="representativePhone"
                type="tel"
                placeholder="例: 09012345678"
                maxLength={11}
                value={formData.representativePhone}
                onChange={(e) => setFormData({ ...formData, representativePhone: e.target.value.replace(/[^0-9]/g, '') })}
              />
              <p className="text-xs text-muted-foreground">ハイフンなし11桁で入力してください</p>
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
