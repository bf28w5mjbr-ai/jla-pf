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
import CompetitionEntryQualificationsEditor from "@/components/CompetitionEntryQualificationsEditor";
import {
  renderAgeClubSummaryFromFields,
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

  const [requireClubMembership, setRequireClubMembership] = useState(
    initialData.requireClubMembership ?? false
  );
  const [competitionMinAge, setCompetitionMinAge] = useState(
    typeof initialData.minAge === "number" ? String(initialData.minAge) : ""
  );
  const [competitionMaxAge, setCompetitionMaxAge] = useState(
    typeof initialData.maxAge === "number" ? String(initialData.maxAge) : ""
  );
  const [lastSavedAgeClub, setLastSavedAgeClub] = useState({
    requireClubMembership: initialData.requireClubMembership ?? false,
    minAge: typeof initialData.minAge === "number" ? String(initialData.minAge) : "",
    maxAge: typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "",
  });

  useEffect(() => {
    setParticipantEligibilityText(initialData.participantEligibilityText ?? "");
    setLastSavedEligibility((initialData.participantEligibilityText ?? "").trim());
    setRequireClubMembership(initialData.requireClubMembership ?? false);
    setCompetitionMinAge(typeof initialData.minAge === "number" ? String(initialData.minAge) : "");
    setCompetitionMaxAge(typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "");
    setLastSavedAgeClub({
      requireClubMembership: initialData.requireClubMembership ?? false,
      minAge: typeof initialData.minAge === "number" ? String(initialData.minAge) : "",
      maxAge: typeof initialData.maxAge === "number" ? String(initialData.maxAge) : "",
    });
    setStatusText("");
    setStatusTone("muted");
  }, [
    settingsVersion,
    initialData.participantEligibilityText,
    initialData.requireClubMembership,
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

  const saveAgeClub = async () => {
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
      requireClubMembership === lastSavedAgeClub.requireClubMembership &&
      competitionMinAge.trim() === lastSavedAgeClub.minAge.trim() &&
      competitionMaxAge.trim() === lastSavedAgeClub.maxAge.trim();
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
          requireClubMembership,
          minAge: minAgeValue,
          maxAge: maxAgeValue,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "年齢・所属クラブ設定の更新に失敗しました");
      }
      setLastSavedAgeClub({
        requireClubMembership,
        minAge: competitionMinAge.trim(),
        maxAge: competitionMaxAge.trim(),
      });
      setStatusText("保存しました");
      setStatusTone("success");
      toast.success("年齢・所属クラブを更新しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "年齢・所属クラブ設定の更新に失敗しました");
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
          <CardTitle className="text-base font-semibold">大会出場条件</CardTitle>
          <CardDescription className="text-sm">
            誰がエントリーできるか（参加対象者・必要な資格・年齢とクラブ所属）の現在の設定です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-4 sm:px-5">
          <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-muted-foreground">参加対象者</p>
            {renderParticipantEligibilitySummary(initialData.participantEligibilityText)}
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-muted-foreground">参加資格</p>
            {renderRequiredQualificationsSummary(initialData.requiredQualifications)}
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-muted-foreground">年齢・所属クラブ</p>
            {renderAgeClubSummaryFromFields({
              minAge: initialData.minAge,
              maxAge: initialData.maxAge,
              requireClubMembership: initialData.requireClubMembership,
            })}
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
          下の欄にそのまま入力できます。参加対象者と年齢・所属は、入力欄の外をクリックすると変更が保存されます。参加資格は変更後、枠の外をクリックすると保存されます。
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
              void saveEligibility();
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
            underAge={{
              underAgeSystemEnabled: initialData.underAgeSystemEnabled,
              underAgeUThresholds: initialData.underAgeUThresholds,
              underAgeOpenEnabled: initialData.underAgeOpenEnabled,
            }}
            autoSaveOnBlur
            wrapInCard={false}
          />
        </div>

        <div
          className="space-y-3 rounded-lg border border-border bg-card px-3 py-3 sm:px-4"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              void saveAgeClub();
            }
          }}
        >
          <p className="text-xs font-medium text-muted-foreground">年齢・所属クラブ</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            大会全体の年齢範囲と、エントリー時のクラブ所属の要否です。数値は「その歳以上」「その歳以下」で境界の年齢を含みます。
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
          <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <p className="text-xs font-medium text-foreground">所属クラブ</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="participation-require-club"
                  checked={requireClubMembership}
                  onChange={() => setRequireClubMembership(true)}
                  disabled={isSaving}
                />
                <span>所属クラブ必須</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="participation-require-club"
                  checked={!requireClubMembership}
                  onChange={() => setRequireClubMembership(false)}
                  disabled={isSaving}
                />
                <span>所属クラブ不要</span>
              </label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
