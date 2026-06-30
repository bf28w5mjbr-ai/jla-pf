"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";
import { buildAgeCategoryTemplateRows } from "@/lib/seasonalAgeToBirthDateRange";
import { normalizeUnderAgeThresholds } from "@/lib/competitionAgeCategoryFromUnderAge";
import {
  settingsFlatEditSurface,
  settingsFlatHint,
  settingsFlatList,
  settingsFlatRow,
} from "@/components/competitions/management/competitionSettingsFlatUi";
import { cn } from "@/lib/utils";

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
  competitionStartDate?: string | Date | null;
  initialAgeCategories: CompetitionAgeCategoryDraft[];
};

const compactInputClass = "h-8 px-2 text-xs";
const compactDateClass = "h-8 w-[8.75rem] px-1.5 text-xs tabular-nums";

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
  if (!a && !b) return "制限なし";
  if (a && b) return `${a} 〜 ${b}`;
  return a ? `${a} 〜` : `〜 ${b}`;
}

function formatAgeCategoryLabel(c: CompetitionAgeCategoryDraft) {
  return `${c.name} · ${formatAgeCategoryRangeSubtitle(c)}`;
}

function catDraftFromCategory(c: CompetitionAgeCategoryDraft): CatDraft {
  return {
    name: c.name,
    from: toEligibleBirthDateInput(c.eligibleBirthDateFrom),
    to: toEligibleBirthDateInput(c.eligibleBirthDateTo),
  };
}

function parseCompetitionStartDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTemplateRowRange(from: Date | null, to: Date | null): string {
  const a = from ? toEligibleBirthDateInput(from) : "";
  const b = to ? toEligibleBirthDateInput(to) : "";
  if (!a && !b) return "制限なし";
  if (a && b) return `${a} 〜 ${b}`;
  return a ? `${a} 〜` : `〜 ${b}`;
}

export default function CompetitionAgeCategoriesEditor({
  competitionId,
  canEdit,
  competitionStartDate,
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [underAgeModeEnabled, setUnderAgeModeEnabled] = useState(false);
  const [underOpenEnabled, setUnderOpenEnabled] = useState(true);
  const [underUThresholdRows, setUnderUThresholdRows] = useState<string[]>([]);

  const competitionStart = useMemo(
    () => parseCompetitionStartDate(competitionStartDate),
    [competitionStartDate]
  );

  const underAgeThresholds = useMemo(
    () => normalizeUnderAgeThresholds(underUThresholdRows),
    [underUThresholdRows]
  );

  const underAgePreviewRows = useMemo(() => {
    if (!competitionStart || !underAgeModeEnabled) return [];
    return buildAgeCategoryTemplateRows(competitionStart, underAgeThresholds, underOpenEnabled);
  }, [competitionStart, underAgeModeEnabled, underAgeThresholds, underOpenEnabled]);

  const addSectionLocked =
    ageCatBusy === "__new__" ||
    ageCatBusy === "__under_bulk__" ||
    editingCategoryId !== null;

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
        ageCategories.map((c) => [c.id, catDraftFromCategory(c)])
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
      setEditingCategoryId(null);
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

  const handleBulkAddFromUnderAge = async () => {
    if (!competitionStart) {
      toast.error("大会開始日が未設定のため、アンダー制でカテゴリを生成できません");
      return;
    }
    if (underAgePreviewRows.length === 0) {
      toast.error("生成できるカテゴリがありません。U のしきい値または OPEN を確認してください");
      return;
    }

    setAgeCatBusy("__under_bulk__");
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/age-categories/generate-from-under-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uThresholds: underAgeThresholds,
            openEnabled: underOpenEnabled,
          }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "一括追加に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      toast.success(
        typeof body.message === "string" ? body.message : "AGEカテゴリを一括追加しました"
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "一括追加に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const cancelEditAgeCategory = (category: CompetitionAgeCategoryDraft) => {
    setCatDrafts((prev) => ({
      ...prev,
      [category.id]: catDraftFromCategory(category),
    }));
    setEditingCategoryId(null);
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
      setEditingCategoryId((prev) => (prev === categoryRowId ? null : prev));
      toast.success("年齢カテゴリを削除しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const renderEditForm = (c: CompetitionAgeCategoryDraft, d: CatDraft, busy: boolean) => (
    <div className={cn(settingsFlatEditSurface, "space-y-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={d.name}
          disabled={busy}
          placeholder="カテゴリ名"
          onChange={(e) =>
            setCatDrafts((prev) => ({
              ...prev,
              [c.id]: { ...d, name: e.target.value },
            }))
          }
          className={cn(compactInputClass, "min-w-[7rem] flex-1")}
        />
        <Input
          type="date"
          value={d.from}
          disabled={busy}
          onChange={(e) =>
            setCatDrafts((prev) => ({
              ...prev,
              [c.id]: { ...d, from: e.target.value },
            }))
          }
          className={compactDateClass}
          aria-label="生年月日（開始）"
        />
        <span className="text-[10px] text-muted-foreground">〜</span>
        <Input
          type="date"
          value={d.to}
          disabled={busy}
          onChange={(e) =>
            setCatDrafts((prev) => ({
              ...prev,
              [c.id]: { ...d, to: e.target.value },
            }))
          }
          className={compactDateClass}
          aria-label="生年月日（終了）"
        />
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-[11px]"
          disabled={busy}
          onClick={() => void handleSaveAgeCategoryRow(c.id)}
        >
          {busy ? (
            <>
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              保存中
            </>
          ) : (
            "保存"
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-[11px]"
          disabled={busy}
          onClick={() => cancelEditAgeCategory(c)}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className={settingsFlatHint}>種目タブの表示名と、参加可能な生年月日範囲です。</p>

      {ageCategories.length === 0 ? (
        <p className={cn(settingsFlatHint, "py-1")}>
          まだカテゴリがありません。{canEdit ? "下から追加できます。" : ""}
        </p>
      ) : (
        <ul className={settingsFlatList} role="list">
          {ageCategories.map((c) => {
            const d = catDrafts[c.id] ?? catDraftFromCategory(c);
            const busy = ageCatBusy === c.id;
            const isEditing = canEdit && editingCategoryId === c.id;
            const actionsLocked = busy || (editingCategoryId !== null && !isEditing);

            if (isEditing) {
              return (
                <li key={c.id}>{renderEditForm(c, d, busy)}</li>
              );
            }

            return (
              <li key={c.id} className={settingsFlatRow}>
                <p
                  className="min-w-0 flex-1 truncate text-xs leading-none"
                  title={formatAgeCategoryLabel(c)}
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground">
                    {formatAgeCategoryRangeSubtitle(c)}
                  </span>
                </p>
                {canEdit ? (
                  <div className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={actionsLocked}
                      aria-label={`${c.name} を編集`}
                      onClick={() => setEditingCategoryId(c.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={actionsLocked}
                      aria-label={`${c.name} を削除`}
                      onClick={() => void handleDeleteAgeCategory(c.id, formatAgeCategoryLabel(c))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-2 border-t border-border/40 pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={underAgeModeEnabled}
              onChange={(e) => setUnderAgeModeEnabled(e.target.checked)}
              disabled={addSectionLocked || !competitionStart}
            />
            <span>アンダー制で生年月日を自動入力</span>
          </label>
          {!competitionStart ? (
            <p className={settingsFlatHint}>大会開始日を設定すると、アンダー制で一括追加できます。</p>
          ) : null}

          {underAgeModeEnabled && competitionStart ? (
            <div className={cn(settingsFlatEditSurface, "space-y-3")}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-medium text-muted-foreground">U のしきい値（歳）</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => setUnderUThresholdRows((prev) => [...prev, ""])}
                    disabled={addSectionLocked}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    追加
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {underUThresholdRows.length === 0 ? (
                    <p className={settingsFlatHint}>
                      行がない場合は OPEN のみ（他に U がないときは年齢無差別）として生成されます。
                    </p>
                  ) : null}
                  {underUThresholdRows.map((row, idx) => (
                    <div key={idx} className="flex max-w-xs items-center gap-1.5">
                      <span className="w-5 text-center text-[10px] text-muted-foreground">
                        {idx + 1}
                      </span>
                      <Input
                        className={compactInputClass}
                        inputMode="numeric"
                        value={row}
                        placeholder="例: 15"
                        disabled={addSectionLocked}
                        onChange={(e) => {
                          const v = e.target.value;
                          setUnderUThresholdRows((prev) => {
                            const next = [...prev];
                            next[idx] = v;
                            return next;
                          });
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        aria-label="この行を削除"
                        onClick={() =>
                          setUnderUThresholdRows((prev) => prev.filter((_, i) => i !== idx))
                        }
                        disabled={addSectionLocked}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  checked={underOpenEnabled}
                  onChange={(e) => setUnderOpenEnabled(e.target.checked)}
                  disabled={addSectionLocked}
                />
                <span>最大 U より上を OPEN とする（オフのときその年齢帯はエントリー不可）</span>
              </label>
              {underAgePreviewRows.length > 0 ? (
                <ul className={cn(settingsFlatList, "rounded-md border border-border/40")} role="list">
                  {underAgePreviewRows.map((row) => (
                    <li key={row.name} className={settingsFlatRow}>
                      <p className="min-w-0 flex-1 truncate text-xs leading-none">
                        <span className="font-medium text-foreground">{row.name}</span>
                        <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground">
                          {formatTemplateRowRange(
                            row.eligibleBirthDateFrom,
                            row.eligibleBirthDateTo
                          )}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={settingsFlatHint}>プレビューできるカテゴリがありません。</p>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-[11px]"
                  disabled={addSectionLocked || underAgePreviewRows.length === 0}
                  onClick={() => void handleBulkAddFromUnderAge()}
                >
                  {ageCatBusy === "__under_bulk__" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      追加中
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      一括追加
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                id="new-age-cat-name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="カテゴリ名（例: ジュニア）"
                disabled={addSectionLocked}
                className={cn(compactInputClass, "min-w-[8rem] flex-1")}
              />
              <Input
                type="date"
                value={newCatFrom}
                onChange={(e) => setNewCatFrom(e.target.value)}
                disabled={addSectionLocked}
                className={compactDateClass}
                aria-label="新規カテゴリの生年月日（開始）"
              />
              <span className="text-[10px] text-muted-foreground">〜</span>
              <Input
                type="date"
                value={newCatTo}
                onChange={(e) => setNewCatTo(e.target.value)}
                disabled={addSectionLocked}
                className={compactDateClass}
                aria-label="新規カテゴリの生年月日（終了）"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 gap-1 px-2.5 text-[11px]"
                disabled={addSectionLocked}
                onClick={() => void handleAddAgeCategory()}
              >
                {ageCatBusy === "__new__" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    追加中
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    追加
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
