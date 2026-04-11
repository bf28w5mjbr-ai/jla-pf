"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { fieldHintClass, pageIntroTextClass } from "@/lib/explanation";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";

interface Club {
  id: string;
  name: string;
  nameKana: string | null;
  abbreviation: string | null;
  websiteUrl: string | null;
  isLifesavingClub: boolean;
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
    abbreviation: club.abbreviation || "",
    websiteUrl: club.websiteUrl || "",
    isLifesavingClub:
      club.isLifesavingClub ?? Boolean(club.patrolLocation?.trim()),
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

  const handleOfficePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, officePostalCode: postalCode });
    
    if (postalCode.length === 7) {
      try {
        const res = await fetch(`/api/postal-code?zipcode=${postalCode}`);
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
      router.push(appRoutes.clubs.root(club.id));
      router.refresh();
    } catch (err) {
      console.error("Update club error:", err);
      toast.error("クラブ情報の更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">クラブ編集</p>
            <p className={cn(pageIntroTextClass("compact"), "mt-1")}>
              基本情報と事務局情報を更新できます。保存後はクラブ詳細ページに戻ります。
            </p>
          </div>
          {/* 基本情報セクション */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h3 className="border-b pb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

              <div className="space-y-2">
                <Label htmlFor="abbreviation">略称</Label>
                <Input
                  id="abbreviation"
                  type="text"
                  placeholder="例: TLSC"
                  maxLength={20}
                  value={formData.abbreviation}
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                />
              </div>
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

            <div className="space-y-2 md:max-w-xs">
              <Label htmlFor="establishedYear">クラブ設立年</Label>
              <Input
                id="establishedYear"
                numericInput="integer"
                placeholder="例: 2000"
                min="1900"
                max={new Date().getFullYear()}
                value={formData.establishedYear}
                onChange={(e) => setFormData({ ...formData, establishedYear: e.target.value })}
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
                  <span className={cn(fieldHintClass("guided"), "mt-1 block")}>
                    チェックすると監視場所を登録できます。他種目のクラブの場合はオフにしてください。
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
                    onChange={(e) => setFormData({ ...formData, patrolLocation: e.target.value })}
                  />
                </div>
              )}
            </div>
          </section>

          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
            代表者情報はクラブ編集フォームでは変更できません。変更が必要な場合は運営側の所定手続きで対応してください。
          </div>

          {/* 事務局情報セクション */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h3 className="border-b pb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              事務局情報
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* 事務局郵便番号 */}
              <div className="space-y-2">
                <Label htmlFor="officePostalCode">事務局郵便番号</Label>
                <Input
                  id="officePostalCode"
                  type="text"
                  numericInput="integer"
                  placeholder="例: 1500001"
                  maxLength={7}
                  value={formData.officePostalCode}
                  onChange={(e) => handleOfficePostalCodeChange(e.target.value)}
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
                numericInput="integer"
                placeholder="例: 0312345678"
                maxLength={11}
                value={formData.officePhone}
                onChange={(e) => setFormData({ ...formData, officePhone: e.target.value })}
              />
              <p className={fieldHintClass("compact")}>ハイフンなし10〜11桁で入力してください</p>
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
          </section>

          {/* ボタン */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(appRoutes.clubs.root(club.id))}
              disabled={loading}
              className="w-full sm:w-auto min-w-[160px]"
            >
              詳細ページへ戻る
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
              className="w-full sm:w-auto min-w-[120px]"
            >
              <X className="h-4 w-4" />
              キャンセル
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto min-w-[140px]">
              <Save className="h-4 w-4" />
              {loading ? "保存中..." : "変更を保存"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
