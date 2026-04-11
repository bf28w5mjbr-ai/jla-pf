"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Link2, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  isValidJlaMemberNumber,
  normalizeJlaMemberNumber,
} from "@/lib/jlaMemberNumber";
import {
  qualificationJapaneseExpression,
  qualificationJapaneseLabel,
  qualificationJapaneseList,
} from "@/lib/qualificationLabels";
import { normalizeQualificationKind } from "@/lib/qualificationTemplateRules";

type TemplateRow = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  requiresExpiry: boolean;
  validityMonths: number | null;
  domain: string | null;
  level: string | null;
  minAge: number | null;
  prerequisiteExpression: string | null;
  nextKinds: string[];
};

type Props = {
  templates: TemplateRow[];
  linkedKinds: string[];
  /** プロフィールで登録済みの JLA メンバーID（ダイアログ初期値） */
  initialJlaMemberNumber?: string | null;
};

const domainOrder = [
  "Foundation",
  "BLS",
  "WaterSafety",
  "Surf",
  "Pool",
  "IRB",
  "PWRC",
  "Junior",
  "Referee",
  "CrossDomain",
] as const;

const domainLabelMap: Record<string, string> = {
  Foundation: "基礎資格",
  BLS: "BLS指導者",
  WaterSafety: "ウォーターセーフティ指導者",
  Surf: "サーフ",
  Pool: "プール",
  IRB: "IRB",
  PWRC: "PWRC",
  Junior: "ジュニア",
  Referee: "審判",
  CrossDomain: "領域横断",
  Other: "その他",
};

export default function QualificationsSelectionClient({
  templates,
  linkedKinds,
  initialJlaMemberNumber = null,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [jlaMemberNumber, setJlaMemberNumber] = useState(() =>
    normalizeJlaMemberNumber(initialJlaMemberNumber ?? "")
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    setJlaMemberNumber(normalizeJlaMemberNumber(initialJlaMemberNumber ?? ""));
  }, [initialJlaMemberNumber]);
  const linkedNormalized = useMemo(
    () => new Set(linkedKinds.map((k) => normalizeQualificationKind(k))),
    [linkedKinds]
  );

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = [...templates].sort((a, b) => {
      const domainA = a.domain ?? "Other";
      const domainB = b.domain ?? "Other";
      if (domainA !== domainB) return domainA.localeCompare(domainB);
      const ageA = typeof a.minAge === "number" ? a.minAge : Number.MAX_SAFE_INTEGER;
      const ageB = typeof b.minAge === "number" ? b.minAge : Number.MAX_SAFE_INTEGER;
      if (ageA !== ageB) return ageA - ageB;
      return a.kind.localeCompare(b.kind);
    });
    const filteredRows =
      query.length === 0
        ? rows
        : rows.filter((row) => {
            const label = qualificationJapaneseLabel(row.kind, row.name).toLowerCase();
            const normalizedKind = row.kind.toLowerCase();
            const prerequisite = (row.prerequisiteExpression ?? "").toLowerCase();
            return (
              label.includes(query) ||
              normalizedKind.includes(query) ||
              prerequisite.includes(query)
            );
          });
    const map = new Map<string, TemplateRow[]>();
    for (const row of filteredRows) {
      const domain = row.domain?.trim() || "Other";
      map.set(domain, [...(map.get(domain) ?? []), row]);
    }
    const domains = [...map.keys()].sort((a, b) => {
      const ai = domainOrder.indexOf(a as (typeof domainOrder)[number]);
      const bi = domainOrder.indexOf(b as (typeof domainOrder)[number]);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
    return { map, domains, total: filteredRows.length };
  }, [search, templates]);

  const selectableKinds = useMemo(
    () =>
      templates
        .filter((t) => !linkedNormalized.has(normalizeQualificationKind(t.kind)))
        .map((t) => t.kind),
    [linkedNormalized, templates]
  );

  const selectedCount = selected.size;
  const selectedAvailableCount = useMemo(() => {
    let count = 0;
    for (const kind of selected) {
      if (!linkedNormalized.has(normalizeQualificationKind(kind))) count += 1;
    }
    return count;
  }, [linkedNormalized, selected]);

  const toggle = (kind: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(selectableKinds));
  };
  const clearAll = () => setSelected(new Set());
  const selectDomain = (domain: string) => {
    const rows = grouped.map.get(domain) ?? [];
    const domainKinds = rows
      .map((r) => r.kind)
      .filter((kind) => !linkedNormalized.has(normalizeQualificationKind(kind)));
    setSelected((prev) => new Set([...prev, ...domainKinds]));
  };
  const clearDomain = (domain: string) => {
    const rows = grouped.map.get(domain) ?? [];
    const domainSet = new Set(rows.map((r) => r.kind));
    setSelected((prev) => {
      const next = new Set([...prev]);
      for (const kind of domainSet) next.delete(kind);
      return next;
    });
  };

  const openApplyDialog = () => {
    if (selectedCount === 0 || submitting) return;
    setJlaMemberNumber(normalizeJlaMemberNumber(initialJlaMemberNumber ?? ""));
    setApplyDialogOpen(true);
  };

  const confirmApplyFromDialog = async () => {
    if (selectedCount === 0 || submitting) return;
    const cert = normalizeJlaMemberNumber(jlaMemberNumber);
    if (!isValidJlaMemberNumber(cert)) {
      toast.error("JLAメンバーIDは500から始まる半角9桁の数字で入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const targets = [...selected];
      const results = await Promise.allSettled(
        targets.map(async (kind) => {
          const res = await fetch("/api/qualifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              provisionalLink: true,
              certNumber: cert,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            throw new Error(`${kind}: ${data.error ?? "暫定紐付けに失敗しました"}`);
          }
          return kind;
        })
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const ng = results.filter((r) => r.status === "rejected");
      if (ok > 0) {
        toast.success(`${ok}件を暫定紐付けしました（審査待ち）`);
        router.refresh();
      }
      if (ng.length > 0) {
        const first = ng[0];
        const msg =
          first?.status === "rejected" && first.reason instanceof Error
            ? first.reason.message
            : "一部の暫定紐付けに失敗しました";
        toast.error(msg);
        if (ok > 0) {
          toast.message("未成功の資格はそのまま選択中です。内容を確認してから再試行できます。");
        }
      }
      if (ok > 0 && ng.length === 0) {
        setApplyDialogOpen(false);
        setSelected(new Set());
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-4 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-100">
        <p className="font-semibold">資格の選択</p>
        <p className="mt-1 text-xs leading-relaxed">
          資格を選んで申請すると、マイアカウントに反映されます。申請時は JLA
          メンバーIDの入力が必要です。すでに紐付け済みの資格は選択できません。
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="資格名や前提条件で検索"
          className="h-9"
        />
        <p className="text-xs text-muted-foreground sm:text-right">
          表示中: <span className="font-semibold text-foreground">{grouped.total}</span> 件
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          選択中: <span className="font-semibold text-foreground">{selectedCount}</span> 件
        </p>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
            <CheckSquare className="mr-1 h-3.5 w-3.5" />
            全選択
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>
            <Square className="mr-1 h-3.5 w-3.5" />
            解除
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {grouped.domains.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            条件に一致する資格が見つかりませんでした。
          </p>
        ) : (
          grouped.domains.map((domain) => {
          const rows = grouped.map.get(domain) ?? [];
          return (
            <section key={domain} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {domainLabelMap[domain] ?? domain}
                </h2>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => selectDomain(domain)}
                  >
                    この領域を選択
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => clearDomain(domain)}
                  >
                    この領域を解除
                  </Button>
                </div>
              </div>
              <ul className="grid gap-3">
                {rows.map((template) => {
                  const label = qualificationJapaneseLabel(template.kind, template.name);
                  const linked = linkedNormalized.has(normalizeQualificationKind(template.kind));
                  const checked = selected.has(template.kind);
                  return (
                    <li
                      key={template.id}
                      className={cn(
                        "rounded-xl border p-4 shadow-sm",
                        linked
                          ? "border-emerald-300/70 bg-emerald-50/40 dark:border-emerald-800/70 dark:bg-emerald-950/20"
                          : checked
                            ? "border-primary/60 bg-primary/5"
                            : "border-border/80 bg-muted/10"
                      )}
                    >
                      <label className={cn("flex items-start gap-3", linked ? "cursor-not-allowed" : "cursor-pointer")}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={linked}
                          onChange={() => toggle(template.kind)}
                          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">{label}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                            {template.level ? (
                              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-muted-foreground">
                                区分: {template.level}
                              </span>
                            ) : null}
                            {typeof template.minAge === "number" ? (
                              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-muted-foreground">
                                最低年齢: {template.minAge}歳
                              </span>
                            ) : null}
                            <span className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-muted-foreground">
                              {template.requiresExpiry && template.validityMonths
                                ? `有効期間: ${template.validityMonths}か月`
                                : "有効期限: なし"}
                            </span>
                            {linked ? (
                              <span className="rounded border border-emerald-300/80 bg-emerald-100/70 px-1.5 py-0.5 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-900/40 dark:text-emerald-200">
                                紐付け済み
                              </span>
                            ) : null}
                          </span>
                          {template.prerequisiteExpression ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              前提条件: {qualificationJapaneseExpression(template.prerequisiteExpression)}
                            </span>
                          ) : null}
                          {template.nextKinds.length > 0 ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              次資格: {qualificationJapaneseList(template.nextKinds).join(" / ")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
          })
        )}
      </div>

      <div className="sticky bottom-2 z-20 rounded-xl border border-border/80 bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" onClick={openApplyDialog} disabled={selectedCount === 0 || submitting}>
            <Link2 className="mr-1 h-4 w-4" />
            {submitting
              ? "暫定紐付け中..."
              : `暫定紐付けを申請${selectedCount > 0 ? `（${selectedCount}件）` : ""}`}
          </Button>
        </div>
      </div>

      <Dialog
        open={applyDialogOpen}
        onOpenChange={(open) => {
          setApplyDialogOpen(open);
          if (!open && !submitting) {
            setJlaMemberNumber(normalizeJlaMemberNumber(initialJlaMemberNumber ?? ""));
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>JLAメンバーIDの入力</DialogTitle>
            <DialogDescription>
              選択した {selectedAvailableCount}{" "}
              件の暫定紐付けを申請する前に、協会発行のメンバーIDを入力してください。入力がないと申請は送信されません。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="qual-select-jla-id">JLAメンバーID</Label>
            <Input
              id="qual-select-jla-id"
              value={jlaMemberNumber}
              onChange={(e) => setJlaMemberNumber(normalizeJlaMemberNumber(e.target.value))}
              numericInput="integer"
              maxLength={9}
              placeholder="500123456"
              inputMode="numeric"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              500から始まる半角9桁の数字で入力してください。
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApplyDialogOpen(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={() => void confirmApplyFromDialog()} disabled={submitting}>
              {submitting ? "申請中…" : "申請する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
