"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import EntrySettingsEditor from "@/components/EntrySettingsEditor";
import CompetitionAgeCategoriesEditor from "@/components/CompetitionAgeCategoriesEditor";
import CompetitionEntryQualificationsEditor from "@/components/CompetitionEntryQualificationsEditor";
import {
  competitionAgeRangeLabel,
  renderRequiredQualificationsSummary,
} from "@/lib/competitionParticipationSummaries";
import {
  settingsFlatBlockTitleClassName,
  settingsFlatDivide,
  settingsFlatEditSurface,
  settingsFlatFieldGroup,
  settingsFlatHint,
  settingsFlatRow,
  settingsFlatSectionLabel,
  settingsFlatStatusClass,
  settingsFlatValueStrong,
} from "@/components/competitions/management/competitionSettingsFlatUi";
import { cn } from "@/lib/utils";
type EntrySettingsEditorProps = ComponentProps<typeof EntrySettingsEditor>;

const compactInputClass = "h-8 px-2 text-xs";

function participantEligibilityLabel(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "制限なし";
}

function competitionAgesFromStrings(minAge: string, maxAge: string) {
  return {
    minAge: minAge.trim() === "" ? null : Number(minAge),
    maxAge: maxAge.trim() === "" ? null : Number(maxAge),
  };
}

type Props = {
  competitionId: string;
  canEdit: boolean;
  isPublished: boolean;
  requiresParticipantNotice: boolean;
  settingsVersion: string;
  initialData: EntrySettingsEditorProps["initialData"] & {
    competitionStartDate?: string | Date | null;
  };
  initialEvents: NonNullable<EntrySettingsEditorProps["initialEvents"]>;
  initialAgeCategories?: EntrySettingsEditorProps["initialAgeCategories"];
  qualificationTemplates?: EntrySettingsEditorProps["qualificationTemplates"];
};

export default function CompetitionParticipationConditionsEditor(props: Props) {
  return <CompetitionParticipationConditionsEditorInner key={props.settingsVersion} {...props} />;
}

function CompetitionParticipationConditionsEditorInner({
  competitionId,
  canEdit,
  isPublished: _isPublished,
  requiresParticipantNotice,
  settingsVersion,
  initialData,
  initialEvents: _initialEvents,
  initialAgeCategories: _initialAgeCategories,
  qualificationTemplates = [],
}: Props) {
  const router = useRouter();
  const [statusText, setStatusText] = useState("");
  const [statusTone, setStatusTone] = useState<"muted" | "success" | "error">("muted");
  const [isSaving, setIsSaving] = useState(false);

  const [participantEligibilityText, setParticipantEligibilityText] = useState(
    initialData.participantEligibilityText ?? ""
  );
  const [lastSavedEligibility, setLastSavedEligibility] = useState(
    (initialData.participantEligibilityText ?? "").trim()
  );

  const [competitionMinAge, setCompetitionMinAge] = useState(
    typeof initialData.minAge === "number" ? String(initialData.minAge) : ""
  );
  const [competitionMaxAge, setCompetitionMaxAge] = useState(
    typeof initialData.maxAge === "number" ? String(initialData.maxAge) : ""
  );
  const [lastSavedCompetitionAges, setLastSavedCompetitionAges] = useState({
    minAge: typeof initialData.minAge === "number" ? String(initialData.minAge) : "",
    maxAge: typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "",
  });
  const [isEditingEligibility, setIsEditingEligibility] = useState(false);
  const [isEditingCompetitionAges, setIsEditingCompetitionAges] = useState(false);

  useEffect(() => {
    setParticipantEligibilityText(initialData.participantEligibilityText ?? "");
    setLastSavedEligibility((initialData.participantEligibilityText ?? "").trim());
    setCompetitionMinAge(typeof initialData.minAge === "number" ? String(initialData.minAge) : "");
    setCompetitionMaxAge(typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "");
    setLastSavedCompetitionAges({
      minAge: typeof initialData.minAge === "number" ? String(initialData.minAge) : "",
      maxAge: typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "",
    });
    setIsEditingEligibility(false);
    setIsEditingCompetitionAges(false);
    setStatusText("");
    setStatusTone("muted");
  }, [
    settingsVersion,
    initialData.participantEligibilityText,
    initialData.minAge,
    initialData.maxAge,
  ]);

  useEffect(() => {
    if (statusTone !== "success") return;
    const t = window.setTimeout(() => {
      setStatusText("");
      setStatusTone("muted");
    }, 1800);
    return () => window.clearTimeout(t);
  }, [statusTone]);

  const saveEligibility = async (): Promise<boolean> => {
    const next = participantEligibilityText.trim();
    if (next === lastSavedEligibility) return true;
    if (isSaving) return false;
    try {
      setIsSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");
      const res = await fetch(`/api/competitions/${competitionId}/participant-eligibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantEligibilityText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "参加対象者の更新に失敗しました");
      }
      setLastSavedEligibility(next);
      setStatusText("保存しました");
      setStatusTone("success");
      toast.success("参加対象者の説明を更新しました");
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "参加対象者の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveCompetitionAges = async (): Promise<boolean> => {
    const minAgeValue = competitionMinAge.trim() === "" ? null : Number(competitionMinAge);
    const maxAgeValue = competitionMaxAge.trim() === "" ? null : Number(competitionMaxAge);
    if (minAgeValue !== null && (Number.isNaN(minAgeValue) || minAgeValue < 0)) {
      toast.error("最小年齢は0以上の数値で入力してください");
      setStatusText("最小年齢を確認してください");
      setStatusTone("error");
      return false;
    }
    if (maxAgeValue !== null && (Number.isNaN(maxAgeValue) || maxAgeValue < 0)) {
      toast.error("最大年齢は0以上の数値で入力してください");
      setStatusText("最大年齢を確認してください");
      setStatusTone("error");
      return false;
    }
    if (minAgeValue !== null && maxAgeValue !== null && minAgeValue > maxAgeValue) {
      toast.error("最小年齢は最大年齢以下にしてください");
      setStatusText("年齢の範囲を確認してください");
      setStatusTone("error");
      return false;
    }
    const same =
      competitionMinAge.trim() === lastSavedCompetitionAges.minAge.trim() &&
      competitionMaxAge.trim() === lastSavedCompetitionAges.maxAge.trim();
    if (same) return true;
    if (isSaving) return false;
    try {
      setIsSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");
      const res = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minAge: minAgeValue,
          maxAge: maxAgeValue,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "大会全体の年齢の更新に失敗しました");
      }
      setLastSavedCompetitionAges({
        minAge: competitionMinAge.trim(),
        maxAge: competitionMaxAge.trim(),
      });
      setStatusText("保存しました");
      setStatusTone("success");
      toast.success("大会全体の年齢を更新しました");
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "大会全体の年齢の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEligibility = async () => {
    const saved = await saveEligibility();
    if (saved) setIsEditingEligibility(false);
  };

  const cancelEditEligibility = () => {
    setParticipantEligibilityText(lastSavedEligibility);
    setIsEditingEligibility(false);
  };

  const handleSaveCompetitionAges = async () => {
    const saved = await saveCompetitionAges();
    if (saved) setIsEditingCompetitionAges(false);
  };

  const cancelEditCompetitionAges = () => {
    setCompetitionMinAge(lastSavedCompetitionAges.minAge);
    setCompetitionMaxAge(lastSavedCompetitionAges.maxAge);
    setIsEditingCompetitionAges(false);
  };

  const sectionEditing = isEditingEligibility || isEditingCompetitionAges;

  if (!canEdit) {
    return (
      <section className="py-4">
        <h2 className={settingsFlatBlockTitleClassName()}>大会出場条件</h2>
        <p className={cn(settingsFlatHint, "mt-0.5")}>
          参加対象者・資格・年齢の現在の設定です。
        </p>
        <div className={cn("mt-3", settingsFlatDivide)}>
          <div className={settingsFlatFieldGroup}>
            <p className={settingsFlatSectionLabel}>参加対象者</p>
            <p className={cn(settingsFlatValueStrong, "truncate")}>
              {participantEligibilityLabel(initialData.participantEligibilityText)}
            </p>
            <p className={cn(settingsFlatSectionLabel, "mt-2")}>大会全体の年齢</p>
            <p className={settingsFlatValueStrong}>
              {competitionAgeRangeLabel({
                minAge: initialData.minAge,
                maxAge: initialData.maxAge,
              })}
            </p>
          </div>
          <div className={settingsFlatFieldGroup}>
            <p className={settingsFlatSectionLabel}>AGEカテゴリ</p>
            <CompetitionAgeCategoriesEditor
              key={`${settingsVersion}-age-cats-readonly`}
              competitionId={competitionId}
              canEdit={false}
              competitionStartDate={initialData.competitionStartDate}
              initialAgeCategories={_initialAgeCategories ?? []}
            />
          </div>
          <div className={settingsFlatFieldGroup}>
            <p className={settingsFlatSectionLabel}>参加資格</p>
            {renderRequiredQualificationsSummary(
              initialData.requiredQualifications,
              _initialAgeCategories ?? null
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-4">
      <h2 className={settingsFlatBlockTitleClassName()}>大会出場条件</h2>
      <p className={cn(settingsFlatStatusClass(statusTone), "mt-1")}>
        {statusText || "編集ボタンから内容を変更できます。"}
      </p>

      <div className={cn("mt-3", settingsFlatDivide)}>
        <div className={settingsFlatFieldGroup}>
          <p className={settingsFlatSectionLabel}>参加対象者（自由記述）</p>
          {isEditingEligibility ? (
            <div className={cn(settingsFlatEditSurface, "space-y-2")}>
                <Textarea
                  id="participation-eligibility"
                  value={participantEligibilityText}
                  onChange={(e) => setParticipantEligibilityText(e.target.value)}
                  placeholder="例: ○○クラブ所属者のみ、18歳以上の男女、会員限定 など"
                  rows={3}
                  disabled={isSaving}
                  className="min-h-0 resize-y px-2 py-1.5 text-xs leading-relaxed"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {participantEligibilityText.length} 文字 · 未入力は「制限なし」
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={isSaving}
                      onClick={() => void handleSaveEligibility()}
                    >
                      {isSaving ? (
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
                      disabled={isSaving}
                      onClick={cancelEditEligibility}
                    >
                      キャンセル
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={settingsFlatRow}>
                <p
                  className="min-w-0 flex-1 truncate text-xs leading-none"
                  title={participantEligibilityLabel(participantEligibilityText)}
                >
                  <span
                    className={cn(
                      participantEligibilityText.trim()
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {participantEligibilityLabel(participantEligibilityText)}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                  disabled={isSaving || sectionEditing}
                  aria-label="参加対象者を編集"
                  onClick={() => setIsEditingEligibility(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

          <p className={cn(settingsFlatSectionLabel, "mt-3")}>大会全体の年齢</p>
          {isEditingCompetitionAges ? (
            <div className={cn(settingsFlatEditSurface, "space-y-2")}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    id="participation-min-age"
                    numericInput="integer"
                    min="0"
                    value={competitionMinAge}
                    onChange={(e) => setCompetitionMinAge(e.target.value)}
                    placeholder="最小（以上）"
                    disabled={isSaving}
                    className={cn(compactInputClass, "w-[7.5rem]")}
                    aria-label="最小年齢（任意・以上）"
                  />
                  <span className="text-[10px] text-muted-foreground">〜</span>
                  <Input
                    id="participation-max-age"
                    numericInput="integer"
                    min="0"
                    value={competitionMaxAge}
                    onChange={(e) => setCompetitionMaxAge(e.target.value)}
                    placeholder="最大（以下）"
                    disabled={isSaving}
                    className={cn(compactInputClass, "w-[7.5rem]")}
                    aria-label="最大年齢（任意・以下）"
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2.5 text-[11px]"
                    disabled={isSaving}
                    onClick={() => void handleSaveCompetitionAges()}
                  >
                    {isSaving ? (
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
                    disabled={isSaving}
                    onClick={cancelEditCompetitionAges}
                  >
                    キャンセル
                  </Button>
                </div>
              </div>
            ) : (
              <div className={settingsFlatRow}>
                <p className="min-w-0 flex-1 truncate text-xs leading-none text-foreground">
                  {competitionAgeRangeLabel(
                    competitionAgesFromStrings(competitionMinAge, competitionMaxAge)
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                  disabled={isSaving || sectionEditing}
                  aria-label="大会全体の年齢を編集"
                  onClick={() => setIsEditingCompetitionAges(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
        </div>

        <div className={settingsFlatFieldGroup}>
          <p className={settingsFlatSectionLabel}>AGEカテゴリ</p>
          <CompetitionAgeCategoriesEditor
            key={`${settingsVersion}-age-cats`}
            competitionId={competitionId}
            canEdit={canEdit && !isSaving}
            competitionStartDate={initialData.competitionStartDate}
            initialAgeCategories={_initialAgeCategories ?? []}
          />
        </div>

        <div className={settingsFlatFieldGroup}>
          <p className={settingsFlatSectionLabel}>参加資格</p>
          <CompetitionEntryQualificationsEditor
            key={`${settingsVersion}-qual`}
            competitionId={competitionId}
            canEdit={canEdit && !isSaving}
            requiresParticipantNotice={requiresParticipantNotice}
            qualificationTemplates={qualificationTemplates}
            initialRequiredQualifications={initialData.requiredQualifications}
            ageCategories={(_initialAgeCategories ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              displayOrder: c.displayOrder,
            }))}
            autoSaveOnBlur
            wrapInCard={false}
          />
        </div>
      </div>
    </section>
  );
}
