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
  parseAgeQualificationTiers,
  parseUnderQualificationTiers,
  type AgeQualificationTier,
} from "@/lib/competitionEntryAgeTiered";
import { expectedUnderFeeTierKeys, partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";
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

type UnderAgeSlice = Pick<
  {
    underAgeSystemEnabled?: boolean | null;
    underAgeUThresholds?: number[] | null;
    underAgeOpenEnabled?: boolean | null;
  },
  "underAgeSystemEnabled" | "underAgeUThresholds" | "underAgeOpenEnabled"
>;

export type CompetitionEntryQualificationsEditorProps = {
  competitionId: string;
  canEdit: boolean;
  requiresParticipantNotice: boolean;
  qualificationTemplates: QualificationTemplate[];
  /** requiredQualifications + アンダー帯の算出に必要な大会行の一部 */
  initialRequiredQualifications: unknown;
  underAge: UnderAgeSlice;
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
  underAge,
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

  const initialParsedQualTiers = parseAgeQualificationTiers(
    initialRequiredQualifications,
    allowedQualificationSet
  );
  const initialParsedUnderQualTiers = parseUnderQualificationTiers(
    initialRequiredQualifications,
    allowedQualificationSet
  );

  const [qualPricingMode, setQualPricingMode] = useState<"flat" | "byAge" | "byUnder">(() => {
    if (initialParsedUnderQualTiers?.length) return "byUnder";
    if (initialParsedQualTiers?.length) return "byAge";
    return "flat";
  });
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

  const [underQualDraft, setUnderQualDraft] = useState<Record<string, string[]>>(() => {
    if (!underAge.underAgeSystemEnabled) return {};
    const part = partitionUnderAgeBands(
      underAge.underAgeUThresholds ?? [],
      underAge.underAgeOpenEnabled ?? true
    );
    const keys = expectedUnderFeeTierKeys(part);
    const parsed = initialParsedUnderQualTiers;
    const m: Record<string, string[]> = {};
    for (const k of keys) {
      m[k] = [...(parsed?.find((t) => t.tierKey === k)?.requiredQualifications ?? [])];
    }
    return m;
  });

  const underPartitionForEditors = useMemo(() => {
    if (!underAge.underAgeSystemEnabled) return null;
    return partitionUnderAgeBands(
      underAge.underAgeUThresholds ?? [],
      underAge.underAgeOpenEnabled ?? true
    );
  }, [underAge.underAgeOpenEnabled, underAge.underAgeSystemEnabled, underAge.underAgeUThresholds]);

  const rqFingerprint = useMemo(() => JSON.stringify(initialRequiredQualifications), [initialRequiredQualifications]);
  const underFingerprint = useMemo(
    () =>
      JSON.stringify({
        e: underAge.underAgeSystemEnabled,
        t: underAge.underAgeUThresholds,
        o: underAge.underAgeOpenEnabled,
      }),
    [underAge.underAgeOpenEnabled, underAge.underAgeSystemEnabled, underAge.underAgeUThresholds]
  );

  useEffect(() => {
    const parsedFlat = parseAgeQualificationTiers(initialRequiredQualifications, allowedQualificationSet);
    const parsedUnder = parseUnderQualificationTiers(initialRequiredQualifications, allowedQualificationSet);
    const mode: "flat" | "byAge" | "byUnder" = parsedUnder?.length
      ? "byUnder"
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
    if (underAge.underAgeSystemEnabled) {
      const part = partitionUnderAgeBands(
        underAge.underAgeUThresholds ?? [],
        underAge.underAgeOpenEnabled ?? true
      );
      const keys = expectedUnderFeeTierKeys(part);
      const m: Record<string, string[]> = {};
      for (const k of keys) {
        m[k] = [...(parsedUnder?.find((t) => t.tierKey === k)?.requiredQualifications ?? [])];
      }
      setUnderQualDraft(m);
    } else {
      setUnderQualDraft({});
    }
    dirtyRef.current = false;
  }, [rqFingerprint, underFingerprint, allowedQualificationSet]);

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

  const toggleQualInUnderTier = (tierKey: string, option: string) => {
    markDirty();
    setUnderQualDraft((prev) => {
      const cur = prev[tierKey] ?? [];
      return {
        ...prev,
        [tierKey]: applyEntryQualificationToggleWithCertifiedMacro(
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

    if (qualPricingMode === "byUnder") {
      if (!underAge.underAgeSystemEnabled || !underPartitionForEditors) {
        toast.error("アンダー制を有効にしてから、アンダー区分別の資格を設定してください");
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
        : qualPricingMode === "byUnder" && underPartitionForEditors
          ? {
              underQualificationTiers: expectedUnderFeeTierKeys(underPartitionForEditors).map((k) => ({
                tierKey: k,
                requiredQualifications: normalizeEntryRequiredQualifications(underQualDraft[k] ?? [], {
                  allowedQualifications: allowedQualificationSet,
                  expandCertifiedLifesaverMacro: true,
                }),
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
        requiresParticipantNotice,
        underPartitionForEditors ?? null
      );
      const basePayload =
        qualPricingMode === "byAge"
          ? {
              ageQualificationTiers: (nextStored as { ageQualificationTiers: AgeQualificationTier[] })
                .ageQualificationTiers,
            }
          : qualPricingMode === "byUnder"
            ? {
                underQualificationTiers: (
                  nextStored as {
                    underQualificationTiers: { tierKey: string; requiredQualifications: string[] }[];
                  }
                ).underQualificationTiers,
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
    competitionId,
    initialRequiredQualifications,
    onSuccessfulSave,
    qualPricingMode,
    requiredQualifications,
    requiresParticipantNotice,
    router,
    underAge.underAgeSystemEnabled,
    underPartitionForEditors,
    underQualDraft,
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
              checked={qualPricingMode === "byUnder"}
              onChange={() => {
                markDirty();
                setQualPricingMode("byUnder");
              }}
              disabled={!canEdit || !underAge.underAgeSystemEnabled}
            />
            アンダー区分別
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {qualPricingMode === "byUnder"
            ? "大会でアンダー制を有効にし、U/OPEN を保存してから設定してください。区分キーは料金（アンダー区分別）と一致します。"
            : "年齢は大会の「年齢・所属クラブ」で設定した範囲（開催日時点の満年齢）に合わせて帯を分けてください。帯が重なると保存できません。"}
        </p>
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
        ) : qualPricingMode === "byUnder" && underPartitionForEditors ? (
          <div className="space-y-3">
            {expectedUnderFeeTierKeys(underPartitionForEditors).map((k) => (
              <div key={k} className="space-y-2 rounded-lg border border-border/80 bg-muted/15 p-3">
                <p className="text-sm font-medium leading-tight">{k}</p>
                <QualificationOptionGroups
                  primaryOptions={primaryQualOptions}
                  foundationOptions={foundationQualOptions}
                  otherOptions={otherQualOptions}
                  showCertifiedBulkHelp={showCertifiedBulkHelp}
                  isOptionSelected={(option) => (underQualDraft[k] ?? []).includes(option)}
                  renderOption={(option) => (
                    <label
                      className="flex items-center gap-2 rounded-md border border-gray-200 bg-background px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={(underQualDraft[k] ?? []).includes(option)}
                        onChange={() => toggleQualInUnderTier(k, option)}
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
