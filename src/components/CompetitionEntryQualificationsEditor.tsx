"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  applyEntryQualificationToggleWithCertifiedMacro,
  buildQualificationRelaxAnnouncementFromConfigs,
  CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP,
  deriveEntryQualificationOptionsFromTemplates,
  ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
  getCertifiedLifesaverUpperQualifications,
  normalizeEntryRequiredQualifications,
  parseAgeCategoryQualificationTiers,
  parseAgeQualificationTiers,
  type AgeCategoryQualificationTier,
  type AgeQualificationTier,
} from "@/lib/competitionEntryAgeTiered";
import { splitQualificationOptionsForAdminUi } from "@/lib/competitionEntryQualificationUiGroups";

function withOptionalAnnounce(
  message: string | undefined,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return message && message.trim().length > 0
    ? { ...payload, announcementMessage: message.trim() }
    : payload;
}

function QualificationOptionGroups({
  primaryOptions,
  foundationOptions,
  otherOptions,
  showCertifiedBulkHelp,
  isOptionSelected,
  renderOption,
}: {
  primaryOptions: readonly string[];
  foundationOptions: readonly string[];
  otherOptions: readonly string[];
  showCertifiedBulkHelp: boolean;
  isOptionSelected?: (option: string) => boolean;
  renderOption: (option: string) => ReactNode;
}) {
  const otherSelectedCount = useMemo(
    () =>
      isOptionSelected ? otherOptions.filter((o) => isOptionSelected(o)).length : 0,
    [otherOptions, isOptionSelected]
  );
  const [isOtherOpen, setIsOtherOpen] = useState<boolean>(() => otherSelectedCount > 0);

  return (
    <div className="space-y-3">
      {primaryOptions.length > 0 || foundationOptions.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-3">
          {primaryOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-foreground">選手登録・認定ライフセーバー</p>
              {showCertifiedBulkHelp ? (
                <p className="text-[11px] text-muted-foreground">
                  「{ENTRY_REQUIRED_CERTIFIED_LIFESAVER}」を選択すると、選手登録・BLS・WaterSafety・審判（RefereeC〜S）を除くすべての資格が一括で選択されます。
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {primaryOptions.map((option) => (
                  <Fragment key={option}>{renderOption(option)}</Fragment>
                ))}
              </div>
            </div>
          ) : null}
          {foundationOptions.length > 0 ? (
            <div
              className={
                primaryOptions.length > 0
                  ? "space-y-2 border-t border-border/60 pt-3"
                  : "space-y-2"
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {foundationOptions.map((option) => (
                  <Fragment key={option}>{renderOption(option)}</Fragment>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {otherOptions.length > 0 ? (
        <details
          className="group space-y-2"
          open={isOtherOpen}
          onToggle={(e) => setIsOtherOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-3.5 shrink-0 opacity-70 transition-transform group-open:rotate-180"
              aria-hidden
            />
            <span>
              その他の資格
              {otherSelectedCount > 0 ? `（${otherSelectedCount}件選択中）` : ""}
            </span>
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {otherOptions.map((option) => (
              <Fragment key={option}>{renderOption(option)}</Fragment>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

type QualificationTemplate = { id: string; name: string; kind: string | null };

/** AGEカテゴリ別資格 UI で使うカテゴリ行。表示順は呼び出し側で確定済みのものを渡す */
export type CompetitionAgeCategoryForQualifications = {
  id: string;
  name: string;
  displayOrder: number;
};

export type CompetitionEntryQualificationsEditorProps = {
  competitionId: string;
  canEdit: boolean;
  requiresParticipantNotice: boolean;
  qualificationTemplates: QualificationTemplate[];
  /** requiredQualifications + ageCategory 別ティアを含む大会行の resolved JSON */
  initialRequiredQualifications: unknown;
  /** AGEカテゴリ一覧（空のときはカテゴリ別タブを無効化） */
  ageCategories: CompetitionAgeCategoryForQualifications[];
  /** true: 大会出場条件などカード内。フォーカスがセクション外に出たとき未保存なら保存し、下部の更新ボタンは出さない */
  autoSaveOnBlur?: boolean;
  /** false のとき外側の Card を付けない（親が枠を持つ） */
  wrapInCard?: boolean;
  onSuccessfulSave?: () => void;
};

export default function CompetitionEntryQualificationsEditor({
  competitionId,
  canEdit,
  requiresParticipantNotice,
  qualificationTemplates,
  initialRequiredQualifications,
  ageCategories,
  autoSaveOnBlur = false,
  wrapInCard = true,
  onSuccessfulSave,
}: CompetitionEntryQualificationsEditorProps) {
  const router = useRouter();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const tierIdRef = useRef(1);
  const mkTierRowId = () => `age-tier-${tierIdRef.current++}`;

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const allowedQualificationOptions = useMemo(
    () => deriveEntryQualificationOptionsFromTemplates(qualificationTemplates),
    [qualificationTemplates]
  );
  const allowedQualificationSet = useMemo(
    () => new Set(allowedQualificationOptions),
    [allowedQualificationOptions]
  );
  const certifiedLifesaverUpperQualifications = useMemo(
    () => getCertifiedLifesaverUpperQualifications(allowedQualificationOptions),
    [allowedQualificationOptions]
  );

  const {
    primary: primaryQualOptions,
    foundation: foundationQualOptions,
    other: otherQualOptions,
  } = useMemo(
    () => splitQualificationOptionsForAdminUi(allowedQualificationOptions),
    [allowedQualificationOptions]
  );

  const showCertifiedBulkHelp =
    primaryQualOptions.includes(ENTRY_REQUIRED_CERTIFIED_LIFESAVER) &&
    certifiedLifesaverUpperQualifications.length > 0;

  const [requiredQualifications, setRequiredQualifications] = useState<string[]>(() =>
    normalizeEntryRequiredQualifications(
      Array.isArray(initialRequiredQualifications)
        ? (initialRequiredQualifications as unknown[])
        : [],
      {
        allowedQualifications: allowedQualificationSet,
        expandCertifiedLifesaverMacro: true,
      }
    )
  );

  const orderedFlatBadges = useMemo(() => {
    const selected = new Set(requiredQualifications);
    return [
      ...primaryQualOptions.filter((o) => selected.has(o)),
      ...foundationQualOptions.filter((o) => selected.has(o)),
      ...otherQualOptions.filter((o) => selected.has(o)),
    ];
  }, [requiredQualifications, primaryQualOptions, foundationQualOptions, otherQualOptions]);

  const [isUpdatingQualifications, setIsUpdatingQualifications] = useState(false);

  const sortedAgeCategories = useMemo(
    () => [...ageCategories].sort((a, b) => a.displayOrder - b.displayOrder),
    [ageCategories]
  );

  const initialParsedQualTiers = parseAgeQualificationTiers(
    initialRequiredQualifications,
    allowedQualificationSet
  );
  const initialParsedCategoryQualTiers = parseAgeCategoryQualificationTiers(
    initialRequiredQualifications,
    allowedQualificationSet
  );

  const [qualPricingMode, setQualPricingMode] = useState<"flat" | "byAge" | "byAgeCategory">(
    () => {
      if (initialParsedCategoryQualTiers?.length) return "byAgeCategory";
      if (initialParsedQualTiers?.length) return "byAge";
      return "flat";
    }
  );
  const [ageQualFormRows, setAgeQualFormRows] = useState<
    { id: string; minAge: string; maxAge: string; qualifications: string[] }[]
  >(() => {
    if (initialParsedQualTiers?.length) {
      return initialParsedQualTiers.map((t) => ({
        id: mkTierRowId(),
        minAge: String(t.minAge),
        maxAge: t.maxAge === null ? "" : String(t.maxAge),
        qualifications: [...t.requiredQualifications],
      }));
    }
    return [
      {
        id: mkTierRowId(),
        minAge: "0",
        maxAge: "",
        qualifications: normalizeEntryRequiredQualifications(
          Array.isArray(initialRequiredQualifications)
            ? (initialRequiredQualifications as unknown[])
            : [],
          {
            allowedQualifications: allowedQualificationSet,
            expandCertifiedLifesaverMacro: true,
          }
        ),
      },
    ];
  });

  const [categoryQualDraft, setCategoryQualDraft] = useState<Record<string, string[]>>(() => {
    const parsed = initialParsedCategoryQualTiers;
    const m: Record<string, string[]> = {};
    for (const cat of sortedAgeCategories) {
      m[cat.id] = [
        ...(parsed?.find((t) => t.ageCategoryId === cat.id)?.requiredQualifications ?? []),
      ];
    }
    return m;
  });

  const rqFingerprint = useMemo(() => JSON.stringify(initialRequiredQualifications), [initialRequiredQualifications]);
  const ageCategoriesFingerprint = useMemo(
    () => JSON.stringify(sortedAgeCategories.map((c) => c.id)),
    [sortedAgeCategories]
  );

  useEffect(() => {
    const parsedFlat = parseAgeQualificationTiers(initialRequiredQualifications, allowedQualificationSet);
    const parsedCategory = parseAgeCategoryQualificationTiers(
      initialRequiredQualifications,
      allowedQualificationSet
    );
    const mode: "flat" | "byAge" | "byAgeCategory" = parsedCategory?.length
      ? "byAgeCategory"
      : parsedFlat?.length
        ? "byAge"
        : "flat";
    setQualPricingMode(mode);
    setRequiredQualifications(
      normalizeEntryRequiredQualifications(
        Array.isArray(initialRequiredQualifications)
          ? (initialRequiredQualifications as unknown[])
          : [],
        {
          allowedQualifications: allowedQualificationSet,
          expandCertifiedLifesaverMacro: true,
        }
      )
    );
    if (parsedFlat?.length) {
      setAgeQualFormRows(
        parsedFlat.map((t) => ({
          id: mkTierRowId(),
          minAge: String(t.minAge),
          maxAge: t.maxAge === null ? "" : String(t.maxAge),
          qualifications: [...t.requiredQualifications],
        }))
      );
    } else {
      setAgeQualFormRows([
        {
          id: mkTierRowId(),
          minAge: "0",
          maxAge: "",
          qualifications: normalizeEntryRequiredQualifications(
            Array.isArray(initialRequiredQualifications)
              ? (initialRequiredQualifications as unknown[])
              : [],
            {
              allowedQualifications: allowedQualificationSet,
              expandCertifiedLifesaverMacro: true,
            }
          ),
        },
      ]);
    }
    const nextCatDraft: Record<string, string[]> = {};
    for (const cat of sortedAgeCategories) {
      nextCatDraft[cat.id] = [
        ...(parsedCategory?.find((t) => t.ageCategoryId === cat.id)?.requiredQualifications ?? []),
      ];
    }
    setCategoryQualDraft(nextCatDraft);
    dirtyRef.current = false;
  }, [rqFingerprint, ageCategoriesFingerprint, allowedQualificationSet]);

  const toggleQualification = (value: string) => {
    markDirty();
    setRequiredQualifications((current) =>
      applyEntryQualificationToggleWithCertifiedMacro(current, value, allowedQualificationOptions)
    );
  };

  const toggleQualInTier = (rowId: string, option: string) => {
    markDirty();
    setAgeQualFormRows((rows) =>
      rows.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          qualifications: applyEntryQualificationToggleWithCertifiedMacro(
            r.qualifications,
            option,
            allowedQualificationOptions
          ),
        };
      })
    );
  };

  const toggleQualInCategoryTier = (ageCategoryId: string, option: string) => {
    markDirty();
    setCategoryQualDraft((prev) => {
      const cur = prev[ageCategoryId] ?? [];
      return {
        ...prev,
        [ageCategoryId]: applyEntryQualificationToggleWithCertifiedMacro(
          cur,
          option,
          allowedQualificationOptions
        ),
      };
    });
  };

  const handleUpdateQualifications = useCallback(async () => {
    if (qualPricingMode === "byAge") {
      for (const row of ageQualFormRows) {
        const minAge = parseInt(row.minAge, 10);
        const maxRaw = row.maxAge.trim();
        const maxAge = maxRaw === "" ? null : parseInt(maxRaw, 10);
        if (!Number.isFinite(minAge) || minAge < 0) {
          toast.error("各年齢帯の下限年齢を正しく入力してください");
          return;
        }
        if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) {
          toast.error("上限年齢は下限以上にするか、上限なしの場合は空欄にしてください");
          return;
        }
      }
    }

    if (qualPricingMode === "byAgeCategory") {
      if (sortedAgeCategories.length === 0) {
        toast.error(
          "先に大会出場条件の「AGEカテゴリ」でカテゴリを作成してから、AGEカテゴリ別の資格を設定してください"
        );
        return;
      }
    }

    const nextStored: unknown =
      qualPricingMode === "byAge"
        ? {
            ageQualificationTiers: ageQualFormRows.map((row) => {
              const minAge = parseInt(row.minAge, 10);
              const maxRaw = row.maxAge.trim();
              const maxAge = maxRaw === "" ? null : parseInt(maxRaw, 10);
              return {
                minAge,
                maxAge,
                requiredQualifications: normalizeEntryRequiredQualifications(row.qualifications, {
                  allowedQualifications: allowedQualificationSet,
                  expandCertifiedLifesaverMacro: true,
                }),
              };
            }),
          }
        : qualPricingMode === "byAgeCategory"
          ? {
              ageCategoryQualificationTiers: sortedAgeCategories.map((cat) => ({
                ageCategoryId: cat.id,
                requiredQualifications: normalizeEntryRequiredQualifications(
                  categoryQualDraft[cat.id] ?? [],
                  {
                    allowedQualifications: allowedQualificationSet,
                    expandCertifiedLifesaverMacro: true,
                  }
                ),
              })),
            }
          : normalizeEntryRequiredQualifications(requiredQualifications, {
              allowedQualifications: allowedQualificationSet,
              expandCertifiedLifesaverMacro: true,
            });

    setIsUpdatingQualifications(true);

    try {
      const announce = buildQualificationRelaxAnnouncementFromConfigs(
        initialRequiredQualifications,
        nextStored,
        requiresParticipantNotice
      );
      const basePayload =
        qualPricingMode === "byAge"
          ? {
              ageQualificationTiers: (nextStored as { ageQualificationTiers: AgeQualificationTier[] })
                .ageQualificationTiers,
            }
          : qualPricingMode === "byAgeCategory"
            ? {
                ageCategoryQualificationTiers: (
                  nextStored as {
                    ageCategoryQualificationTiers: AgeCategoryQualificationTier[];
                  }
                ).ageCategoryQualificationTiers,
              }
            : {
                requiredQualifications: normalizeEntryRequiredQualifications(requiredQualifications, {
                  allowedQualifications: allowedQualificationSet,
                  expandCertifiedLifesaverMacro: true,
                }),
              };
      const response = await fetch(`/api/competitions/${competitionId}/entry-qualifications`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(withOptionalAnnounce(announce, basePayload)),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "必要資格の更新に失敗しました");
      }

      const data = await response.json();
      if (Array.isArray(data.requiredQualifications)) {
        setRequiredQualifications(
          normalizeEntryRequiredQualifications(data.requiredQualifications, {
            allowedQualifications: allowedQualificationSet,
            expandCertifiedLifesaverMacro: true,
          })
        );
      }

      toast.success("出場に必要な資格を更新しました");
      dirtyRef.current = false;
      router.refresh();
      onSuccessfulSave?.();
    } catch (error) {
      console.error("必要資格の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "必要資格の更新に失敗しました");
    } finally {
      setIsUpdatingQualifications(false);
    }
  }, [
    ageQualFormRows,
    allowedQualificationSet,
    categoryQualDraft,
    competitionId,
    initialRequiredQualifications,
    onSuccessfulSave,
    qualPricingMode,
    requiredQualifications,
    requiresParticipantNotice,
    router,
    sortedAgeCategories,
  ]);

  const onSectionBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!autoSaveOnBlur || !canEdit) return;
    const related = e.relatedTarget as Node | null;
    if (related && sectionRef.current?.contains(related)) return;
    window.setTimeout(() => {
      if (!sectionRef.current?.contains(document.activeElement)) {
        if (!dirtyRef.current) return;
        void handleUpdateQualifications();
      }
    }, 0);
  };

  const inner = (
    <div
      ref={sectionRef}
      className="space-y-3"
      onBlur={onSectionBlur}
    >
      {allowedQualificationOptions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          資格テンプレートが未登録のため、参加資格を設定できません。
        </div>
      ) : null}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              className="h-3.5 w-3.5"
              checked={qualPricingMode === "flat"}
              onChange={() => {
                markDirty();
                setQualPricingMode("flat");
              }}
              disabled={!canEdit || isUpdatingQualifications}
            />
            全員同一
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              className="h-3.5 w-3.5"
              checked={qualPricingMode === "byAge"}
              onChange={() => {
                markDirty();
                setQualPricingMode("byAge");
              }}
              disabled={!canEdit || isUpdatingQualifications}
            />
            年齢帯別
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              className="h-3.5 w-3.5"
              checked={qualPricingMode === "byAgeCategory"}
              onChange={() => {
                markDirty();
                setQualPricingMode("byAgeCategory");
              }}
              disabled={!canEdit || sortedAgeCategories.length === 0}
            />
            年齢カテゴリ別
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {qualPricingMode === "byAgeCategory"
            ? "大会出場条件の「AGEカテゴリ」で定義した区分ごとに資格を設定します。各カテゴリに生年月日の範囲が必要です。エントリー時は登録者の生年月日が属する区分の資格が使われます（複数に該当する場合は表示順が先の区分）。"
            : qualPricingMode === "byAge"
              ? "年齢は大会の「年齢・所属クラブ」で設定した範囲（開催日時点の満年齢）に合わせて帯を分けてください。帯が重なると保存できません。"
              : "すべての参加者に同じ資格を要求します。"}
        </p>
        {sortedAgeCategories.length === 0 ? (
          <p className="text-[11px] text-amber-800 dark:text-amber-200/90">
            年齢カテゴリ別を使うには、先に大会出場条件の「AGEカテゴリ」でカテゴリを作成してください。
          </p>
        ) : null}
        {autoSaveOnBlur ? (
          <p className="text-[11px] text-muted-foreground">
            変更後、セクションの外をクリックすると保存されます。
          </p>
        ) : null}

        {qualPricingMode === "flat" ? (
          <div className="space-y-2">
            {orderedFlatBadges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {orderedFlatBadges.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
            <QualificationOptionGroups
              primaryOptions={primaryQualOptions}
              foundationOptions={foundationQualOptions}
              otherOptions={otherQualOptions}
              showCertifiedBulkHelp={showCertifiedBulkHelp}
              isOptionSelected={(option) => requiredQualifications.includes(option)}
              renderOption={(option) => (
                <label
                  className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={requiredQualifications.includes(option)}
                    onChange={() => toggleQualification(option)}
                    disabled={!canEdit || isUpdatingQualifications}
                  />
                  <span>{option}</span>
                </label>
              )}
            />
          </div>
        ) : qualPricingMode === "byAgeCategory" && sortedAgeCategories.length > 0 ? (
          <div className="space-y-3">
            {sortedAgeCategories.map((cat) => (
              <div
                key={cat.id}
                className="space-y-2 rounded-lg border border-border/80 bg-muted/15 p-3"
              >
                <p className="text-sm font-medium leading-tight">{cat.name}</p>
                <QualificationOptionGroups
                  primaryOptions={primaryQualOptions}
                  foundationOptions={foundationQualOptions}
                  otherOptions={otherQualOptions}
                  showCertifiedBulkHelp={showCertifiedBulkHelp}
                  isOptionSelected={(option) =>
                    (categoryQualDraft[cat.id] ?? []).includes(option)
                  }
                  renderOption={(option) => (
                    <label
                      className="flex items-center gap-2 rounded-md border border-gray-200 bg-background px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={(categoryQualDraft[cat.id] ?? []).includes(option)}
                        onChange={() => toggleQualInCategoryTier(cat.id, option)}
                        disabled={!canEdit || isUpdatingQualifications}
                      />
                      <span>{option}</span>
                    </label>
                  )}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {ageQualFormRows.map((row) => (
              <div key={row.id} className="space-y-2 rounded-lg border border-border/80 bg-muted/15 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">下限（歳）</Label>
                    <Input
                      numericInput="integer"
                      min={0}
                      className="h-8 w-20 text-xs"
                      value={row.minAge}
                      onChange={(e) => {
                        markDirty();
                        const v = e.target.value;
                        setAgeQualFormRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, minAge: v } : r))
                        );
                      }}
                      disabled={!canEdit || isUpdatingQualifications}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">上限（空=なし）</Label>
                    <Input
                      numericInput="integer"
                      min={0}
                      className="h-8 w-20 text-xs"
                      value={row.maxAge}
                      onChange={(e) => {
                        markDirty();
                        const v = e.target.value;
                        setAgeQualFormRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, maxAge: v } : r))
                        );
                      }}
                      disabled={!canEdit || isUpdatingQualifications}
                    />
                  </div>
                  {canEdit && ageQualFormRows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive"
                      onClick={() => {
                        markDirty();
                        setAgeQualFormRows((prev) => prev.filter((r) => r.id !== row.id));
                      }}
                    >
                      削除
                    </Button>
                  ) : null}
                </div>
                <QualificationOptionGroups
                  primaryOptions={primaryQualOptions}
                  foundationOptions={foundationQualOptions}
                  otherOptions={otherQualOptions}
                  showCertifiedBulkHelp={showCertifiedBulkHelp}
                  isOptionSelected={(option) => row.qualifications.includes(option)}
                  renderOption={(option) => (
                    <label
                      className="flex items-center gap-2 rounded-md border border-gray-200 bg-background px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={row.qualifications.includes(option)}
                        onChange={() => toggleQualInTier(row.id, option)}
                        disabled={!canEdit || isUpdatingQualifications}
                      />
                      <span>{option}</span>
                    </label>
                  )}
                />
              </div>
            ))}
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  markDirty();
                  setAgeQualFormRows((prev) => [
                    ...prev,
                    {
                      id: mkTierRowId(),
                      minAge: "0",
                      maxAge: "",
                      qualifications: [],
                    },
                  ]);
                }}
              >
                年齢帯を追加
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {canEdit && !autoSaveOnBlur ? (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleUpdateQualifications()}
            disabled={isUpdatingQualifications}
            className="w-full md:w-auto"
          >
            {isUpdatingQualifications ? "更新中..." : "必要資格を更新"}
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (!wrapInCard) {
    return inner;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
        <CardTitle className="text-base font-semibold">出場に必要な資格</CardTitle>
        <CardDescription className="space-y-1 text-xs">
          <span className="block">未選択の場合は資格不要です。</span>
          <span className="block text-muted-foreground">資格候補は資格テンプレートから自動反映されます。</span>
          <span className="block text-muted-foreground">{CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3">{inner}</CardContent>
    </Card>
  );
}
