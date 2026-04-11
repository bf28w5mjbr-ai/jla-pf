"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";

type Props = {
  competitionId: string;
  canEdit: boolean;
  initialData: {
    name: string;
    nameKana: string | null;
    category: string | null;
    startDate: string;
    endDate: string;
    venue: string;
    venueAddress: string | null;
  };
};

const CATEGORY_OPTIONS = [
  { value: "プール", label: "プール" },
  { value: "オーシャン", label: "オーシャン" },
] as const;

export default function CompetitionBasicInfoEditor({ competitionId, canEdit, initialData }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(initialData.name);
  const [nameKana, setNameKana] = useState(initialData.nameKana ?? "");
  const [category, setCategory] = useState(initialData.category ?? "");
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [endDate, setEndDate] = useState(initialData.endDate);
  const [venue, setVenue] = useState(initialData.venue);
  const [venueAddress, setVenueAddress] = useState(initialData.venueAddress ?? "");
  const hasCustomCategory =
    category.trim().length > 0 &&
    !CATEGORY_OPTIONS.some((option) => option.value === category.trim());

  const resetForm = () => {
    setName(initialData.name);
    setNameKana(initialData.nameKana ?? "");
    setCategory(initialData.category ?? "");
    setStartDate(initialData.startDate);
    setEndDate(initialData.endDate);
    setVenue(initialData.venue);
    setVenueAddress(initialData.venueAddress ?? "");
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("大会名を入力してください");
      return;
    }
    if (!venue.trim()) {
      toast.error("開催場所を入力してください");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("終了日は開始日より後にしてください");
      return;
    }
    if (!CATEGORY_OPTIONS.some((option) => option.value === category.trim())) {
      toast.error("大会カテゴリはプールまたはオーシャンを選択してください");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`/api/competitions/${competitionId}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          nameKana,
          category,
          startDate,
          endDate,
          venue: venue.trim(),
          venueAddress,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "大会情報の更新に失敗しました");
      }

      toast.success("大会情報を更新しました");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Update competition error:", error);
      toast.error(error instanceof Error ? error.message : "大会情報の更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">基本情報</CardTitle>
              <CardDescription className="text-xs">
                大会名はページ上部と同じです。変更は「編集」からできます。
              </CardDescription>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setIsEditing(true)}>
                編集
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-3">
          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">開催期間</p>
                <p className="text-sm font-medium">
                  {new Date(startDate).toLocaleDateString("ja-JP")} 〜{" "}
                  {new Date(endDate).toLocaleDateString("ja-JP")}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">開催場所</p>
                <p className="text-sm font-medium">{venue || "未設定"}</p>
                {venueAddress && <p className="mt-0.5 text-xs text-muted-foreground">{venueAddress}</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
        <CardTitle className="text-base font-semibold">基本情報を編集</CardTitle>
        <CardDescription className="text-xs">保存すると公開ページに反映されます。</CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-3">
        <AutofillSyncForm onSubmit={handleSave} className="space-y-3">
          <div>
            <Label htmlFor="name" className="text-xs">
              大会名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 第1回全国ライフセービング選手権大会"
              required
              className="mt-1 h-9 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="nameKana" className="text-xs">
              大会名（カナ）
            </Label>
            <Input
              id="nameKana"
              value={nameKana}
              onChange={(e) => setNameKana(e.target.value)}
              placeholder="例: ダイイッカイゼンコクライフセービングセンシュケンタイカイ"
              className="mt-1 h-9 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="category" className="text-xs">
              大会カテゴリ <span className="text-red-500">*</span>
            </Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
            >
              {hasCustomCategory && (
                <option value={category}>{`現在値: ${category}`}</option>
              )}
              <option value="" disabled>
                選択してください
              </option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              種目設定のカテゴリは、ここで選んだ内容に自動で固定されます。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="startDate" className="text-xs">
                開始日 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-xs">
                終了日 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="venue" className="text-xs">
              開催場所 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="例: 東京辰巳国際水泳場"
              required
              className="mt-1 h-9 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="venueAddress" className="text-xs">
              会場住所
            </Label>
            <Input
              id="venueAddress"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              placeholder="例: 東京都江東区辰巳2-8-10"
              className="mt-1 h-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={isSaving}>
              {isSaving ? "保存中…" : "保存"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel} disabled={isSaving}>
              キャンセル
            </Button>
          </div>
        </AutofillSyncForm>
      </CardContent>
    </Card>
  );
}
