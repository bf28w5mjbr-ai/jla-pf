"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TechnicalOfficialTier } from "@/lib/technicalOfficialRules";

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  requireClubMembership: boolean;
  initialTiers: unknown;
};

function parseInitialTiers(raw: unknown): { minEntries: string; requiredCount: string }[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ minEntries: "1", requiredCount: "1" }];
  }
  const rows: { minEntries: string; requiredCount: string }[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as { minEntries?: unknown; requiredCount?: unknown };
    if (typeof r.minEntries !== "number" || typeof r.requiredCount !== "number") continue;
    rows.push({
      minEntries: String(r.minEntries),
      requiredCount: String(r.requiredCount),
    });
  }
  return rows.length > 0 ? rows : [{ minEntries: "1", requiredCount: "1" }];
}

export default function TechnicalOfficialSettingsEditor({
  organizationId,
  competitionId,
  canEdit,
  requireClubMembership,
  initialTiers,
}: Props) {
  const router = useRouter();
  const [tierRows, setTierRows] = useState(() => parseInitialTiers(initialTiers));
  const [saving, setSaving] = useState(false);

  const updateTier = (index: number, field: "minEntries" | "requiredCount", value: string) => {
    setTierRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addTier = () => {
    setTierRows((prev) => [...prev, { minEntries: "", requiredCount: "" }]);
  };

  const removeTier = (index: number) => {
    setTierRows((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    const tiers: TechnicalOfficialTier[] = [];
    for (const row of tierRows) {
      const minEntries = Number(row.minEntries);
      const requiredCount = Number(row.requiredCount);
      if (!Number.isInteger(minEntries) || !Number.isInteger(requiredCount)) {
        toast.error("段階は整数で入力してください");
        return;
      }
      if (minEntries < 1 || requiredCount < 0) {
        toast.error("個人エントリー件数の閾値は1以上、必要人数は0以上にしてください");
        return;
      }
      tiers.push({ minEntries, requiredCount });
    }
    const mins = tiers.map((t) => t.minEntries);
    if (new Set(mins).size !== mins.length) {
      toast.error("同じ個人エントリー件数の段階が重複しています");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/technical-official-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            technicalOfficialTiers: tiers,
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "保存に失敗しました");
      }
      toast.success("テクニカルオフィシャル設定を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15"
            aria-hidden
          >
            <UserCog className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="font-medium">資格要件はオフィシャル設定に連動</Badge>
          </div>
        </div>
      </div>

      <CardDescription className="text-xs leading-relaxed text-muted-foreground">
        閾値の「件数」はクラブに紐づく<strong className="font-medium text-foreground">個人エントリー合計（キャンセル除く）</strong>
        です。チーム種目のエントリー件数は含みません。段階表のうち、
        <strong className="font-medium text-foreground">条件を満たす行のうち最も高い閾値の行だけ</strong>
        が適用されます。
        {!requireClubMembership ? (
          <span className="mt-2 block rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-3 py-2 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50">
            この大会は「所属クラブ不要」です。クラブに紐づくエントリーがない場合は要件の対象外になります。
          </span>
        ) : null}
      </CardDescription>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">段階（閾値と人数）</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            個人エントリー合計が左の件数以上のとき、右の人数のテクニカルオフィシャルが必要です。
          </p>
        </div>

        {/* デスクトップ: 表風グリッド */}
        <div className="hidden overflow-hidden rounded-xl border border-border/70 bg-background/60 shadow-sm sm:block">
          <div className="grid grid-cols-[2.75rem_1fr_1fr_auto] gap-2 border-b border-border/60 bg-muted/50 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="tabular-nums">#</span>
            <span>個人エントリー合計（件以上）</span>
            <span>必要人数</span>
            <span className="w-10 text-center" aria-hidden />
          </div>
          {tierRows.map((row, index) => (
            <div
              key={index}
              className={cn(
                "grid grid-cols-[2.75rem_1fr_1fr_auto] items-center gap-2 border-b border-border/50 px-3 py-2.5 last:border-b-0",
                index % 2 === 1 && "bg-muted/20"
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                {index + 1}
              </span>
              <Input
                className="h-10 tabular-nums"
                inputMode="numeric"
                value={row.minEntries}
                onChange={(e) => updateTier(index, "minEntries", e.target.value)}
                disabled={!canEdit}
                aria-label={`段階${index + 1} 個人エントリー合計の閾値`}
              />
              <Input
                className="h-10 tabular-nums"
                inputMode="numeric"
                value={row.requiredCount}
                onChange={(e) => updateTier(index, "requiredCount", e.target.value)}
                disabled={!canEdit}
                aria-label={`段階${index + 1} 必要人数`}
              />
              {canEdit && tierRows.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeTier(index)}
                  aria-label={`段階${index + 1}を削除`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : (
                <span className="w-10" aria-hidden />
              )}
            </div>
          ))}
        </div>

        {/* モバイル: カード */}
        <div className="space-y-3 sm:hidden">
          {tierRows.map((row, index) => (
            <div
              key={index}
              className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                {canEdit && tierRows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive"
                    onClick={() => removeTier(index)}
                  >
                    削除
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">個人エントリー合計（件以上）</Label>
                  <Input
                    className="h-11 tabular-nums"
                    inputMode="numeric"
                    value={row.minEntries}
                    onChange={(e) => updateTier(index, "minEntries", e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">必要人数</Label>
                  <Input
                    className="h-11 tabular-nums"
                    inputMode="numeric"
                    value={row.requiredCount}
                    onChange={(e) => updateTier(index, "requiredCount", e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {canEdit ? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addTier}>
            <Plus className="h-3.5 w-3.5" />
            段階を追加
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            保存すると公開ページの説明と、クラブ側の不足判定に反映されます。
          </p>
          <Button type="button" className="w-full sm:w-auto sm:min-w-[7rem]" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "設定を保存"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
