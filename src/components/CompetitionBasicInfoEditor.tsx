"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import {
  buildEntryPeriodExtensionAnnouncement,
  isPeriodExtension,
} from "@/lib/autoEntryChangeAnnouncement";
import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  datetimeLocalInputValueToUtcIsoString,
  formatCompetitionEntryPeriodRangeJa,
} from "@/lib/datetimeLocal";

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
    requireClubMembership: boolean;
  };
};

const CATEGORY_OPTIONS = [
  { value: "プール", label: "プール" },
  { value: "オーシャン", label: "オーシャン" },
] as const;

const ENTRY_DATETIME_LOCAL_OPTS = { timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE } as const;

export default function CompetitionBasicInfoEditor({ competitionId, canEdit, initialData }: Props) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState(initialData.category ?? "");
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [endDate, setEndDate] = useState(initialData.endDate);
  const [entryStartDate, setEntryStartDate] = useState(initialData.entryStartDate);
  const [entryEndDate, setEntryEndDate] = useState(initialData.entryEndDate);
  const [venue, setVenue] = useState(initialData.venue);
  const [requireClubMembership, setRequireClubMembership] = useState(
    initialData.requireClubMembership ?? false
  );
  const [lastSaved, setLastSaved] = useState({
    category: initialData.category ?? "",
    startDate: initialData.startDate,
    endDate: initialData.endDate,
    entryStartDate: initialData.entryStartDate,
    entryEndDate: initialData.entryEndDate,
    venue: initialData.venue,
    requireClubMembership: initialData.requireClubMembership ?? false,
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
    setRequireClubMembership(initialData.requireClubMembership ?? false);
    setLastSaved({
      category: initialData.category ?? "",
      startDate: initialData.startDate,
      endDate: initialData.endDate,
      entryStartDate: initialData.entryStartDate,
      entryEndDate: initialData.entryEndDate,
      venue: initialData.venue,
      requireClubMembership: initialData.requireClubMembership ?? false,
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
    initialData.requireClubMembership,
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
          name: initialData.name.trim(),
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
    const nextStartTrim = nextEntryStartDate.trim();
    const nextEndTrim = nextEntryEndDate.trim();
    if ((nextStartTrim && !nextEndTrim) || (!nextStartTrim && nextEndTrim)) {
      toast.error("エントリー期間は開始と終了の日時を両方入力してください");
      setStatusText("エントリー期間は開始と終了の日時を両方入力してください");
      setStatusTone("error");
      return;
    }

    let entryStartUtcIso: string | null = null;
    let entryEndUtcIso: string | null = null;
    if (nextStartTrim && nextEndTrim) {
      entryStartUtcIso = datetimeLocalInputValueToUtcIsoString(nextStartTrim, ENTRY_DATETIME_LOCAL_OPTS);
      entryEndUtcIso = datetimeLocalInputValueToUtcIsoString(nextEndTrim, ENTRY_DATETIME_LOCAL_OPTS);
      if (!entryStartUtcIso || !entryEndUtcIso) {
        toast.error("エントリー期間の日時形式が正しくありません");
        setStatusText("エントリー期間の日時形式が正しくありません");
        setStatusTone("error");
        return;
      }
      if (new Date(entryStartUtcIso) > new Date(entryEndUtcIso)) {
        toast.error("エントリー終了日時は開始日時より後にしてください");
        setStatusText("エントリー終了日時は開始日時より後にしてください");
        setStatusTone("error");
        return;
      }
    }

    try {
      setIsSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");

      let entryPayload: Record<string, unknown> =
        nextStartTrim && nextEndTrim && entryStartUtcIso && entryEndUtcIso
          ? {
              entryStartDate: entryStartUtcIso,
              entryEndDate: entryEndUtcIso,
            }
          : {
              entryStartDate: "",
              entryEndDate: "",
            };

      const oldStartIso =
        lastSaved.entryStartDate.trim().length > 0
          ? datetimeLocalInputValueToUtcIsoString(lastSaved.entryStartDate, ENTRY_DATETIME_LOCAL_OPTS)
          : null;
      const oldEndIso =
        lastSaved.entryEndDate.trim().length > 0
          ? datetimeLocalInputValueToUtcIsoString(lastSaved.entryEndDate, ENTRY_DATETIME_LOCAL_OPTS)
          : null;
      if (
        oldStartIso &&
        oldEndIso &&
        entryStartUtcIso &&
        entryEndUtcIso &&
        isPeriodExtension(
          new Date(oldStartIso),
          new Date(oldEndIso),
          new Date(entryStartUtcIso),
          new Date(entryEndUtcIso)
        )
      ) {
        const announce = buildEntryPeriodExtensionAnnouncement(
          new Date(oldStartIso),
          new Date(oldEndIso),
          entryStartUtcIso,
          entryEndUtcIso,
          true
        );
        if (announce) {
          entryPayload = { ...entryPayload, announcementMessage: announce };
        }
      }

      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryPayload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { message?: string }));
        throw new Error(data.message || "エントリー期間の更新に失敗しました");
      }
      setLastSaved((prev) => ({
        ...prev,
        entryStartDate: nextStartTrim,
        entryEndDate: nextEndTrim,
      }));
      setEntryStartDate(nextStartTrim);
      setEntryEndDate(nextEndTrim);
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

  const saveRequireClubMembership = async () => {
    if (isSaving) return;
    if (requireClubMembership === lastSaved.requireClubMembership) return;
    try {
      setIsSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireClubMembership }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { message?: string }));
        throw new Error(data.message || "所属クラブ設定の更新に失敗しました");
      }
      setLastSaved((prev) => ({ ...prev, requireClubMembership }));
      setStatusText("保存しました");
      setStatusTone("success");
      toast.success("所属クラブの要否を更新しました");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "所属クラブ設定の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  const readonlyTileClass =
    "rounded-lg border border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3";

  if (!canEdit) {
    return (
      <Card padding="none" className="overflow-hidden border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
          <CardTitle className="text-base font-semibold">大会基本情報</CardTitle>
          <CardDescription className="text-sm">開催日・場所・エントリー期間などの現在の値です。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div className={readonlyTileClass}>
            <p className="text-xs font-medium text-muted-foreground">大会カテゴリ</p>
            <p className="mt-1 text-sm font-medium text-foreground">{category || "未設定"}</p>
          </div>
          <div className={readonlyTileClass}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              開催日
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {new Date(startDate).toLocaleDateString("ja-JP")} 〜{" "}
              {new Date(endDate).toLocaleDateString("ja-JP")}
            </p>
          </div>
          <div className={cn(readonlyTileClass, "sm:col-span-2")}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              エントリー期間
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {(() => {
                const sIso = entryStartDate.trim()
                  ? datetimeLocalInputValueToUtcIsoString(entryStartDate, ENTRY_DATETIME_LOCAL_OPTS)
                  : null;
                const eIso = entryEndDate.trim()
                  ? datetimeLocalInputValueToUtcIsoString(entryEndDate, ENTRY_DATETIME_LOCAL_OPTS)
                  : null;
                if (!sIso || !eIso) return "未設定";
                return (
                  formatCompetitionEntryPeriodRangeJa(new Date(sIso), new Date(eIso)) ?? "未設定"
                );
              })()}
            </p>
          </div>

          <div className={cn(readonlyTileClass, "sm:col-span-2")}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              開催場所
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">{venue || "未設定"}</p>
          </div>

          <div className={cn(readonlyTileClass, "sm:col-span-2")}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              所属クラブ
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {requireClubMembership ? "エントリー時に所属クラブ必須" : "所属クラブ不要"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sectionClass =
    "space-y-3 rounded-lg border border-border bg-card px-3 py-3 sm:px-4 sm:py-3.5";

  return (
    <Card padding="none" className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <CardTitle className="text-base font-semibold">大会基本情報</CardTitle>
        <CardDescription className="text-sm">
          各欄を編集し、フォーカスを外すと自動で保存されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4 sm:px-5">
        <p
          className={cn(
            "text-[11px]",
            statusTone === "success"
              ? "text-emerald-700 dark:text-emerald-300"
              : statusTone === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          )}
        >
          {statusText || "変更後にフォーカスを外すと自動で更新されます。"}
        </p>

        <div className={sectionClass}>
          <p className="text-xs font-medium text-muted-foreground">大会概要</p>
          <div>
            <Label htmlFor="category" className="text-xs">
              大会カテゴリ <span className="text-red-500">*</span>
            </Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => void saveCurrent()}
              className={cn(
                "mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
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
          </div>

          <div
            className="space-y-2"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                void saveCurrent();
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-80" aria-hidden />
              <Label className="text-xs font-normal">
                開催日 <span className="text-red-500">*</span>
              </Label>
            </div>
            <div className="flex min-h-9 items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5">
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="h-8 min-w-0 flex-1 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                disabled={isSaving}
              />
              <span className="shrink-0 text-xs text-muted-foreground">〜</span>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="h-8 min-w-0 flex-1 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        <div
          className={sectionClass}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              void saveEntryPeriod();
            }
          }}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            エントリー期間（日本時間）
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-input bg-background px-2.5 py-2 sm:flex-row sm:items-center">
            <Input
              id="entryStartDate"
              type="datetime-local"
              value={entryStartDate}
              onChange={(e) => setEntryStartDate(e.target.value)}
              className="h-9 min-w-0 flex-1 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
              disabled={isSaving}
            />
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">〜</span>
            <Input
              id="entryEndDate"
              type="datetime-local"
              value={entryEndDate}
              onChange={(e) => setEntryEndDate(e.target.value)}
              className="h-9 min-w-0 flex-1 border-0 px-0 py-0 text-sm shadow-none focus-visible:ring-0"
              disabled={isSaving}
            />
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <Label htmlFor="venue" className="font-medium text-muted-foreground">
              開催場所 <span className="text-red-500">*</span>
            </Label>
          </div>
          <Input
            id="venue"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            onBlur={() => void saveCurrent()}
            placeholder="例: 東京辰巳国際水泳場"
            required
            className="h-9 text-sm"
            disabled={isSaving}
          />
        </div>

        <div
          className={cn(sectionClass, "bg-muted/20")}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              void saveRequireClubMembership();
            }
          }}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            所属クラブ
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            エントリー時に登録クラブの選択を必須にするかどうかです。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2.5 text-sm shadow-sm transition-colors hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60">
              <input
                type="radio"
                name="basic-info-require-club"
                checked={requireClubMembership}
                onChange={() => setRequireClubMembership(true)}
                disabled={isSaving}
                className="h-4 w-4 shrink-0 accent-primary"
              />
              <span>所属クラブ必須</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2.5 text-sm shadow-sm transition-colors hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60">
              <input
                type="radio"
                name="basic-info-require-club"
                checked={!requireClubMembership}
                onChange={() => setRequireClubMembership(false)}
                disabled={isSaving}
                className="h-4 w-4 shrink-0 accent-primary"
              />
              <span>所属クラブ不要</span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
