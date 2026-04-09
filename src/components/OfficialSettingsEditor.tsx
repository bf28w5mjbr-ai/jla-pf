"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, CircleAlert, ShieldCheck } from "lucide-react";

type OfficialSettingsEditorProps = {
  competitionId: string;
  organizationId: string;
  initialEnabled?: boolean;
  templates?: Array<{ id: string; name: string; kind: string }>;
};

export function OfficialSettingsEditor({
  competitionId,
  organizationId,
  initialEnabled = false,
  templates = [],
}: OfficialSettingsEditorProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [savedEnabled, setSavedEnabled] = useState<boolean>(initialEnabled);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = enabled !== savedEnabled;
  const editingStateLabel = enabled ? "設定する（資格要件あり）" : "設定しない（誰でも可）";
  const savedStateLabel = savedEnabled ? "設定する（資格要件あり）" : "設定しない（誰でも可）";

  const templateNameByKind = new Map(
    templates.map((t) => [t.kind, t.name && t.name.trim().length > 0 ? t.name : t.kind])
  );
  const blsName = templateNameByKind.get("BLS") ?? "BLS";
  const waterSafetyName = templateNameByKind.get("WaterSafety") ?? "ウォーターセーフティ";
  const refereeNames = ["RefereeC", "RefereeB", "RefereeA", "RefereeS"].map(
    (kind) => templateNameByKind.get(kind) ?? kind
  );

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/official-qualification-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            officialQualificationFilterEnabled: enabled,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "保存に失敗しました");
      }

      setSavedEnabled(enabled);
      setLastSavedAt(new Date());
      toast.success("資格要件を保存しました");
      router.refresh();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save official positions:", error);
      toast.error(
        error instanceof Error ? error.message : "保存に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border bg-muted/15 px-4 py-3 sm:px-4">
        <CardTitle className="text-base font-semibold">オフィシャル資格要件設定</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          オフィシャル応募時の資格チェック有無を切り替えます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-3.5 sm:px-4">
        <div className="rounded-md border border-border/80 bg-muted/20 px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">編集中の設定</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{editingStateLabel}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={enabled ? "default" : "outline"}
            className="h-auto min-h-12 justify-start px-3 py-2 text-left"
            onClick={() => setEnabled(true)}
          >
            <span className="block">
              <span className="block text-sm font-semibold">設定する</span>
              <span className="block text-[11px] opacity-90">資格を満たす応募者のみ受付</span>
            </span>
          </Button>
          <Button
            type="button"
            variant={!enabled ? "default" : "outline"}
            className="h-auto min-h-12 justify-start px-3 py-2 text-left"
            onClick={() => setEnabled(false)}
          >
            <span className="block">
              <span className="block text-sm font-semibold">設定しない</span>
              <span className="block text-[11px] opacity-90">資格要件なしで受付</span>
            </span>
          </Button>
        </div>

        {enabled ? (
          <div className="rounded-md border border-emerald-300/60 bg-emerald-50/40 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              適用される資格フィルタ（テンプレート参照）
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>
                必須資格: <span className="font-medium text-foreground">{blsName}</span> /{" "}
                <span className="font-medium text-foreground">{waterSafetyName}</span>
              </li>
              <li>
                審判資格: <span className="font-medium text-foreground">{refereeNames.join(" / ")}</span>
                のいずれか
              </li>
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-amber-300/60 bg-amber-50/40 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-medium">
              <CircleAlert className="h-3.5 w-3.5" />
              設定しない場合は資格による応募制限を行いません。
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="space-y-0.5">
            <p className="text-[11px] text-muted-foreground">現在反映中: {savedStateLabel}</p>
            {lastSavedAt ? (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                最終保存: {lastSavedAt.toLocaleString("ja-JP")}
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || justSaved || !dirty}
            className={`h-8 text-xs ${justSaved ? "bg-green-600 hover:bg-green-700" : ""}`}
          >
            {isSaving ? (
              "保存中…"
            ) : justSaved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                保存しました
              </>
            ) : !dirty ? (
              "変更なし"
            ) : (
              "保存"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
