"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import EntrySettingsEditor from "@/components/EntrySettingsEditor";
import CompetitionAgeCategoriesEditor from "@/components/CompetitionAgeCategoriesEditor";
import CompetitionEntryQualificationsEditor from "@/components/CompetitionEntryQualificationsEditor";
import {
  renderCompetitionAgeRangeSummary,
  renderParticipantEligibilitySummary,
  renderRequiredQualificationsSummary,
} from "@/lib/competitionParticipationSummaries";
import { CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP } from "@/lib/competitionEntryAgeTiered";

type EntrySettingsEditorProps = ComponentProps<typeof EntrySettingsEditor>;

type Props = {
  competitionId: string;
  canEdit: boolean;
  isPublished: boolean;
  requiresParticipantNotice: boolean;
  settingsVersion: string;
  initialData: EntrySettingsEditorProps["initialData"];
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

  useEffect(() => {
    setParticipantEligibilityText(initialData.participantEligibilityText ?? "");
    setLastSavedEligibility((initialData.participantEligibilityText ?? "").trim());
    setCompetitionMinAge(typeof initialData.minAge === "number" ? String(initialData.minAge) : "");
    setCompetitionMaxAge(typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "");
    setLastSavedCompetitionAges({
      minAge: typeof initialData.minAge === "number" ? String(initialData.minAge) : "",
      maxAge: typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "",
    });
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

  const saveEligibility = async () => {
    const next = participantEligibilityText.trim();
    if (next === lastSavedEligibility) return;
    if (isSaving) return;
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "参加対象者の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  const saveCompetitionAges = async () => {
    const minAgeValue = competitionMinAge.trim() === "" ? null : Number(competitionMinAge);
    const maxAgeValue = competitionMaxAge.trim() === "" ? null : Number(competitionMaxAge);
    if (minAgeValue !== null && (Number.isNaN(minAgeValue) || minAgeValue < 0)) {
      toast.error("最小年齢は0以上の数値で入力してください");
      setStatusText("最小年齢を確認してください");
      setStatusTone("error");
      return;
    }
    if (maxAgeValue !== null && (Number.isNaN(maxAgeValue) || maxAgeValue < 0)) {
      toast.error("最大年齢は0以上の数値で入力してください");
      setStatusText("最大年齢を確認してください");
      setStatusTone("error");
      return;
    }
    if (minAgeValue !== null && maxAgeValue !== null && minAgeValue > maxAgeValue) {
      toast.error("最小年齢は最大年齢以下にしてください");
      setStatusText("年齢の範囲を確認してください");
      setStatusTone("error");
      return;
    }
    const same =
      competitionMinAge.trim() === lastSavedCompetitionAges.minAge.trim() &&
      competitionMaxAge.trim() === lastSavedCompetitionAges.maxAge.trim();
    if (same) return;
    if (isSaving) return;
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "大会全体の年齢の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  const flushParticipantSection = async () => {
    await saveEligibility();
    await saveCompetitionAges();
  };

  if (!canEdit) {
    return (
      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
          <CardTitle className="text-base font-semibold">大会出場条件</CardTitle>
          <CardDescription className="text-sm">
            誰がエントリーできるか（参加対象者・必要な資格・年齢）の現在の設定です。所属クラブの要否は、このページ上部の大会情報で確認できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-4 sm:px-5">
          <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-muted-foreground">参加対象者</p>
            {renderParticipantEligibilitySummary(initialData.participantEligibilityText)}
            <p className="text-xs font-medium text-muted-foreground">大会全体の年齢</p>
            {renderCompetitionAgeRangeSummary({
              minAge: initialData.minAge,
              maxAge: initialData.maxAge,
            })}
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-muted-foreground">AGEカテゴリ</p>
            <CompetitionAgeCategoriesEditor
              key={`${settingsVersion}-age-cats-readonly`}
              competitionId={competitionId}
              canEdit={false}
              initialAgeCategories={_initialAgeCategories ?? []}
            />
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-muted-foreground">参加資格</p>
            {renderRequiredQualificationsSummary(
              initialData.requiredQualifications,
              _initialAgeCategories ?? null
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <CardTitle className="text-base font-semibold">大会出場条件</CardTitle>
        <CardDescription className="text-sm">
          下の欄にそのまま入力できます。参加対象者（自由記述と大会全体の年齢）は、枠の外をクリックすると保存されます。所属クラブの要否は、このページ上部の大会情報の最下部で設定します。参加資格は変更後、枠の外をクリックすると保存されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4 sm:px-5">
        <p
          className={`text-[11px] ${
            statusTone === "success"
              ? "text-emerald-700 dark:text-emerald-300"
              : statusTone === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {statusText || "変更後にフォーカスを外すと保存されます。"}
        </p>

        <div
          className="space-y-2 rounded-lg border border-border bg-card px-3 py-3 sm:px-4"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              void flushParticipantSection();
            }
          }}
        >
          <p className="text-xs font-medium text-muted-foreground">参加対象者（自由記述）</p>
          <p className="text-[11px] text-muted-foreground">公開ページに表示する補足文です。</p>
          <div className="space-y-2">
            <Label htmlFor="participation-eligibility">内容</Label>
            <Textarea
              id="participation-eligibility"
              value={participantEligibilityText}
              onChange={(e) => setParticipantEligibilityText(e.target.value)}
              placeholder="例: ○○クラブ所属者のみ、18歳以上の男女、会員限定 など"
              rows={4}
              disabled={isSaving}
            />
            <p className="text-sm text-muted-foreground">未入力の場合は「制限なし」として表示されます。</p>
            <p className="text-xs text-muted-foreground">{participantEligibilityText.length} 文字</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">大会全体の年齢</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            エントリーできる年齢の下限・上限です。数値は「その歳以上」「その歳以下」で境界の年齢を含みます。
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="participation-min-age" className="text-xs">
                最小年齢（任意・以上）
              </Label>
              <Input
                id="participation-min-age"
                numericInput="integer"
                min="0"
                value={competitionMinAge}
                onChange={(e) => setCompetitionMinAge(e.target.value)}
                placeholder="例: 18"
                disabled={isSaving}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label htmlFor="participation-max-age" className="text-xs">
                最大年齢（任意・以下）
              </Label>
              <Input
                id="participation-max-age"
                numericInput="integer"
                min="0"
                value={competitionMaxAge}
                onChange={(e) => setCompetitionMaxAge(e.target.value)}
                placeholder="例: 35"
                disabled={isSaving}
                className="mt-1 h-9"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
          <p className="text-xs font-medium text-muted-foreground">AGEカテゴリ</p>
          <CompetitionAgeCategoriesEditor
            key={`${settingsVersion}-age-cats`}
            competitionId={competitionId}
            canEdit={canEdit && !isSaving}
            initialAgeCategories={_initialAgeCategories ?? []}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
          <p className="text-xs font-medium text-muted-foreground">参加資格</p>
          <p className="text-[11px] text-muted-foreground">{CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP}</p>
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
      </CardContent>
    </Card>
  );
}
