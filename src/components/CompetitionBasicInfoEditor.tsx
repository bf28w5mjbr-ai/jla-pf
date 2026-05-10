"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

type Props = {
  competitionId: string;
  canEdit: boolean;
  initialData: {
    name: string;
    category: string | null;
    startDate: string;
    endDate: string;
    entryStartDate: string;
    entryEndDate: string;
    venue: string;
  };
};

const CATEGORY_OPTIONS = [
  { value: "プール", label: "プール" },
  { value: "オーシャン", label: "オーシャン" },
] as const;

export default function CompetitionBasicInfoEditor({ competitionId, canEdit, initialData }: Props) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState(initialData.category ?? "");
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [endDate, setEndDate] = useState(initialData.endDate);
  const [entryStartDate, setEntryStartDate] = useState(initialData.entryStartDate);
  const [entryEndDate, setEntryEndDate] = useState(initialData.entryEndDate);
  const [venue, setVenue] = useState(initialData.venue);
  const [lastSaved, setLastSaved] = useState({
    category: initialData.category ?? "",
    startDate: initialData.startDate,
    endDate: initialData.endDate,
    entryStartDate: initialData.entryStartDate,
    entryEndDate: initialData.entryEndDate,
    venue: initialData.venue,
  });
  const [statusText, setStatusText] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"muted" | "success" | "error">("muted");
  const hasCustomCategory =
    category.trim().length > 0 &&
    !CATEGORY_OPTIONS.some((option) => option.value === category.trim());

  useEffect(() => {
    setCategory(initialData.category ?? "");
    setStartDate(initialData.startDate);
    setEndDate(initialData.endDate);
    setEntryStartDate(initialData.entryStartDate);
    setEntryEndDate(initialData.entryEndDate);
    setVenue(initialData.venue);
    setLastSaved({
      category: initialData.category ?? "",
      startDate: initialData.startDate,
      endDate: initialData.endDate,
      entryStartDate: initialData.entryStartDate,
      entryEndDate: initialData.entryEndDate,
      venue: initialData.venue,
    });
    setStatusText("");
    setStatusTone("muted");
  }, [
    initialData.category,
    initialData.startDate,
    initialData.endDate,
    initialData.entryStartDate,
    initialData.entryEndDate,
    initialData.venue,
  ]);

  useEffect(() => {
    if (statusTone !== "success") return;
    const timer = window.setTimeout(() => {
      setStatusText("");
      setStatusTone("muted");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [statusTone]);

  const saveCurrent = async (next?: Partial<{ category: string; startDate: string; endDate: string; venue: string }>) => {
    const nextCategory = next?.category ?? category;
    const nextStartDate = next?.startDate ?? startDate;
    const nextEndDate = next?.endDate ?? endDate;
    const nextVenue = next?.venue ?? venue;
    if (isSaving) return;
    if (
      nextCategory.trim() === lastSaved.category.trim() &&
      nextStartDate === lastSaved.startDate &&
      nextEndDate === lastSaved.endDate &&
      nextVenue.trim() === lastSaved.venue.trim()
    ) {
      return;
    }
    if (!nextVenue.trim()) {
      toast.error("開催場所を入力してください");
      setStatusText("開催場所を入力してください");
      setStatusTone("error");
      return;
    }
    if (new Date(nextStartDate) > new Date(nextEndDate)) {
      toast.error("終了日は開始日より後にしてください");
      setStatusText("終了日は開始日以降にしてください");
      setStatusTone("error");
      return;
    }
    if (!CATEGORY_OPTIONS.some((option) => option.value === nextCategory.trim())) {
      toast.error("大会カテゴリはプールまたはオーシャンを選択してください");
      setStatusText("カテゴリを選択してください");
      setStatusTone("error");
      return;
    }

    try {
      setIsSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");
      const response = await fetch(`/api/competitions/${competitionId}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: nextCategory,
          startDate: nextStartDate,
          endDate: nextEndDate,
          venue: nextVenue.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "大会情報の更新に失敗しました");
      }

      setLastSaved((prev) => ({
        ...prev,
        category: nextCategory,
        startDate: nextStartDate,
        endDate: nextEndDate,
        venue: nextVenue,
      }));
      setStatusText("保存しました");
      setStatusTone("success");
      router.refresh();
    } catch (error) {
      console.error("Update competition error:", error);
      toast.error(error instanceof Error ? error.message : "大会情報の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  const saveEntryPeriod = async (next?: Partial<{ entryStartDate: string; entryEndDate: string }>) => {
    const nextEntryStartDate = next?.entryStartDate ?? entryStartDate;
    const nextEntryEndDate = next?.entryEndDate ?? entryEndDate;
    if (isSaving) return;
    if (
      nextEntryStartDate === lastSaved.entryStartDate &&
      nextEntryEndDate === lastSaved.entryEndDate
    ) {
      return;
    }
    if ((nextEntryStartDate && !nextEntryEndDate) || (!nextEntryStartDate && nextEntryEndDate)) {
      toast.error("エントリー期間は開始日と終了日を両方入力してください");
      setStatusText("エントリー期間は開始日と終了日を両方入力してください");
      setStatusTone("error");
      return;
    }
    if (
      nextEntryStartDate &&
      nextEntryEndDate &&
      new Date(nextEntryStartDate) > new Date(nextEntryEndDate)
    ) {
      toast.error("エントリー期間の終了日は開始日以降にしてください");
      setStatusText("エントリー期間の終了日は開始日以降にしてください");
      setStatusTone("error");
      return;
    }

    try {
      setIsSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryStartDate: nextEntryStartDate,
          entryEndDate: nextEntryEndDate,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { message?: string }));
        throw new Error(data.message || "エントリー期間の更新に失敗しました");
      }
      setLastSaved((prev) => ({
        ...prev,
        entryStartDate: nextEntryStartDate,
        entryEndDate: nextEntryEndDate,
      }));
      setStatusText("保存しました");
      setStatusTone("success");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "エントリー期間の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="space-y-2 px-4 py-3">
          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">大会カテゴリ</p>
            <p className="text-sm font-medium">{category || "未設定"}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">開催日</p>
            <p className="text-sm font-medium">
              {new Date(startDate).toLocaleDateString("ja-JP")} 〜{" "}
              {new Date(endDate).toLocaleDateString("ja-JP")}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">エントリー期間</p>
            <p className="text-sm font-medium">
              {entryStartDate && entryEndDate
                ? `${new Date(entryStartDate).toLocaleDateString("ja-JP")} 〜 ${new Date(entryEndDate).toLocaleDateString("ja-JP")}`
                : "未設定"}
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">開催場所</p>
                <p className="text-sm font-medium">{venue || "未設定"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="px-4 py-3">
        <div className="space-y-3">
          <p
            className={`text-[11px] ${
              statusTone === "success"
                ? "text-emerald-700 dark:text-emerald-300"
                : statusTone === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {statusText || "変更後にフォーカスを外すと自動で更新されます。"}
          </p>
          <div>
            <Label htmlFor="category" className="text-xs">
              大会カテゴリ <span className="text-red-500">*</span>
            </Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => void saveCurrent()}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
              disabled={isSaving}
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

          <div
            className="space-y-1"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                void saveCurrent();
              }
            }}
          >
            <Label className="text-xs">
              開催日 <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5">
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="h-8 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                disabled={isSaving}
              />
              <span className="text-xs text-muted-foreground">〜</span>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="h-8 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                disabled={isSaving}
              />
            </div>
          </div>

          <div
            className="space-y-1"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                void saveEntryPeriod();
              }
            }}
          >
            <Label className="text-xs">エントリー期間</Label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5">
              <Input
                id="entryStartDate"
                type="date"
                value={entryStartDate}
                onChange={(e) => setEntryStartDate(e.target.value)}
                className="h-8 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                disabled={isSaving}
              />
              <span className="text-xs text-muted-foreground">〜</span>
              <Input
                id="entryEndDate"
                type="date"
                value={entryEndDate}
                onChange={(e) => setEntryEndDate(e.target.value)}
                className="h-8 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                disabled={isSaving}
              />
            </div>
            <p className="text-xs text-muted-foreground">未入力にするとエントリー期間は未設定になります。</p>
          </div>

          <div>
            <Label htmlFor="venue" className="text-xs">
              開催場所 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              onBlur={() => void saveCurrent()}
              placeholder="例: 東京辰巳国際水泳場"
              required
              className="mt-1 h-9 text-sm"
              disabled={isSaving}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
