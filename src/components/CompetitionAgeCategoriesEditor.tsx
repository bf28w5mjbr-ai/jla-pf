"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";

export type CompetitionAgeCategoryDraft = {
  id: string;
  name: string;
  displayOrder: number;
  eligibleBirthDateFrom: Date | string | null;
  eligibleBirthDateTo: Date | string | null;
};

type CatDraft = { name: string; from: string; to: string };

type Props = {
  competitionId: string;
  canEdit: boolean;
  initialAgeCategories: CompetitionAgeCategoryDraft[];
};

function buildAgeCategoryFingerprint(categories: readonly CompetitionAgeCategoryDraft[]): string {
  return categories
    .map(
      (c) =>
        `${c.id}\t${c.name}\t${toEligibleBirthDateInput(
          c.eligibleBirthDateFrom
        )}\t${toEligibleBirthDateInput(c.eligibleBirthDateTo)}`
    )
    .join("\n");
}

function formatAgeCategoryRangeSubtitle(c: CompetitionAgeCategoryDraft) {
  const a = toEligibleBirthDateInput(c.eligibleBirthDateFrom);
  const b = toEligibleBirthDateInput(c.eligibleBirthDateTo);
  if (!a && !b) return "生年月日の制限なし";
  if (a && b) return `${a} 〜 ${b}`;
  return a ? `${a} 〜` : `〜 ${b}`;
}

export default function CompetitionAgeCategoriesEditor({
  competitionId,
  canEdit,
  initialAgeCategories,
}: Props) {
  const router = useRouter();
  const [ageCategories, setAgeCategories] = useState<CompetitionAgeCategoryDraft[]>(
    () => initialAgeCategories
  );
  const [catDrafts, setCatDrafts] = useState<Record<string, CatDraft>>({});
  const [newCatName, setNewCatName] = useState("");
  const [newCatFrom, setNewCatFrom] = useState("");
  const [newCatTo, setNewCatTo] = useState("");
  const [ageCatBusy, setAgeCatBusy] = useState<string | null>(null);

  const initialAgeCategoriesFingerprint = useMemo(
    () => buildAgeCategoryFingerprint(initialAgeCategories),
    [initialAgeCategories]
  );

  useEffect(() => {
    setAgeCategories(initialAgeCategories);
  }, [initialAgeCategoriesFingerprint, initialAgeCategories]);

  useEffect(() => {
    setCatDrafts(
      Object.fromEntries(
        ageCategories.map((c) => [
          c.id,
          {
            name: c.name,
            from: toEligibleBirthDateInput(c.eligibleBirthDateFrom),
            to: toEligibleBirthDateInput(c.eligibleBirthDateTo),
          },
        ])
      )
    );
  }, [ageCategories]);

  const handleSaveAgeCategoryRow = async (categoryRowId: string) => {
    const d = catDrafts[categoryRowId];
    if (!d) return;
    const nameTrim = d.name.trim();
    if (!nameTrim) {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    const fromTrim = d.from.trim();
    const toTrim = d.to.trim();
    if ((fromTrim === "") !== (toTrim === "")) {
      toast.error("生年月日の範囲は、開始・終了を両方入力するか、両方空にしてください");
      return;
    }

    setAgeCatBusy(categoryRowId);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/age-categories/${categoryRowId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameTrim,
            eligibleBirthDateFrom: fromTrim === "" ? null : fromTrim,
            eligibleBirthDateTo: toTrim === "" ? null : toTrim,
          }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "保存に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      toast.success("年齢カテゴリを保存しました（連動中の種目へ反映済み）");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const handleAddAgeCategory = async () => {
    const nameTrim = newCatName.trim();
    if (!nameTrim) {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    const fromTrim = newCatFrom.trim();
    const toTrim = newCatTo.trim();
    if ((fromTrim === "") !== (toTrim === "")) {
      toast.error("生年月日の範囲は、開始・終了を両方入力するか、両方空にしてください");
      return;
    }

    setAgeCatBusy("__new__");
    try {
      const payload: Record<string, unknown> = { name: nameTrim };
      if (fromTrim !== "" && toTrim !== "") {
        payload.eligibleBirthDateFrom = fromTrim;
        payload.eligibleBirthDateTo = toTrim;
      }
      const response = await fetch(`/api/competitions/${competitionId}/age-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "追加に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      setNewCatName("");
      setNewCatFrom("");
      setNewCatTo("");
      toast.success("年齢カテゴリを追加しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const handleDeleteAgeCategory = async (categoryRowId: string, label: string) => {
    if (!window.confirm(`年齢カテゴリ「${label}」を削除しますか？`)) return;
    setAgeCatBusy(categoryRowId);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/age-categories/${categoryRowId}`,
        { method: "DELETE" }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "削除に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      toast.success("年齢カテゴリを削除しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        年齢カテゴリごとに、タブの表示名と参加可能な生年月日範囲を設定します。各カテゴリに紐づく種目へも反映されます。
      </p>

      {ageCategories.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          まだカテゴリがありません。{canEdit ? "下のフォームから追加できます。" : ""}
        </p>
      ) : (
        <ul className="space-y-3" role="list">
          {ageCategories.map((c) => {
            const d = catDrafts[c.id] ?? {
              name: c.name,
              from: toEligibleBirthDateInput(c.eligibleBirthDateFrom),
              to: toEligibleBirthDateInput(c.eligibleBirthDateTo),
            };
            const busy = ageCatBusy === c.id;
            return (
              <li
                key={c.id}
                className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-3 dark:bg-muted/5"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">カテゴリ名</Label>
                    <Input
                      value={d.name}
                      disabled={!canEdit || busy}
                      onChange={(e) =>
                        setCatDrafts((prev) => ({
                          ...prev,
                          [c.id]: { ...d, name: e.target.value },
                        }))
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        disabled={busy}
                        onClick={() => void handleSaveAgeCategoryRow(c.id)}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                            保存中
                          </>
                        ) : (
                          "保存"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleDeleteAgeCategory(c.id, c.name)}
                      >
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                        削除
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">生年月日（開始）</Label>
                    <Input
                      type="date"
                      value={d.from}
                      disabled={!canEdit || busy}
                      onChange={(e) =>
                        setCatDrafts((prev) => ({
                          ...prev,
                          [c.id]: { ...d, from: e.target.value },
                        }))
                      }
                      className="h-8 w-[9.5rem] px-1.5 text-xs"
                    />
                  </div>
                  <span className="pb-2 text-xs text-muted-foreground">〜</span>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">生年月日（終了）</Label>
                    <Input
                      type="date"
                      value={d.to}
                      disabled={!canEdit || busy}
                      onChange={(e) =>
                        setCatDrafts((prev) => ({
                          ...prev,
                          [c.id]: { ...d, to: e.target.value },
                        }))
                      }
                      className="h-8 w-[9.5rem] px-1.5 text-xs"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {canEdit
                    ? "両方空欄は生年月日による制限なし。範囲は両端を含みます。"
                    : formatAgeCategoryRangeSubtitle(c)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-3 rounded-lg border border-dashed border-primary/25 bg-primary/[0.04] p-3 dark:bg-primary/[0.07]">
          <p className="text-xs font-semibold text-foreground">新規カテゴリ</p>
          <div className="space-y-1">
            <Label htmlFor="new-age-cat-name" className="text-[10px] text-muted-foreground">
              名前
            </Label>
            <Input
              id="new-age-cat-name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="例: ジュニア"
              disabled={ageCatBusy === "__new__"}
              className="h-9 max-w-md text-sm"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">開始（任意）</Label>
              <Input
                type="date"
                value={newCatFrom}
                onChange={(e) => setNewCatFrom(e.target.value)}
                disabled={ageCatBusy === "__new__"}
                className="h-8 w-[9.5rem] px-1.5 text-xs"
              />
            </div>
            <span className="pb-2 text-xs text-muted-foreground">〜</span>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">終了（任意）</Label>
              <Input
                type="date"
                value={newCatTo}
                onChange={(e) => setNewCatTo(e.target.value)}
                disabled={ageCatBusy === "__new__"}
                className="h-8 w-[9.5rem] px-1.5 text-xs"
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={ageCatBusy === "__new__"}
            onClick={() => void handleAddAgeCategory()}
          >
            {ageCatBusy === "__new__" ? (
              <>
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                追加中
              </>
            ) : (
              <>
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                カテゴリを追加
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
