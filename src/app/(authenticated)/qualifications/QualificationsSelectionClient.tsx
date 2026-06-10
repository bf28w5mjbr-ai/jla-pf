"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckSquare, Save, Search, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { appRoutes } from "@/lib/appRoutes";
import { userFacingApiErrorMessage } from "@/lib/userFacingApiError";

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
  prerequisiteKinds: string[];
  nextKinds: string[];
};

type Props = {
  templates: TemplateRow[];
  linkedTemplateIds: string[];
  lockedTemplateIds?: string[];
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

function checkedSetFromServer(templates: TemplateRow[], linkedTemplateIds: string[]): Set<string> {
  const linkedIdSet = new Set(linkedTemplateIds);
  const next = new Set<string>();
  for (const t of templates) {
    if (linkedIdSet.has(t.id)) {
      next.add(t.id);
    }
  }
  return next;
}

export default function QualificationsSelectionClient({
  templates,
  linkedTemplateIds,
  lockedTemplateIds = [],
  initialJlaMemberNumber = null,
}: Props) {
  const router = useRouter();
  const [checkedTemplateIds, setCheckedTemplateIds] = useState<Set<string>>(() =>
    checkedSetFromServer(templates, linkedTemplateIds)
  );
  const [submitting, setSubmitting] = useState(false);
  const [jlaMemberNumber, setJlaMemberNumber] = useState(() =>
    normalizeJlaMemberNumber(initialJlaMemberNumber ?? "")
  );
  const [search, setSearch] = useState("");

  /** DB に有効な JLA メンバーIDが紐づいている（この場合、資格保存時に ID の再入力は不要） */
  const accountJlaLinked = useMemo(
    () => isValidJlaMemberNumber(normalizeJlaMemberNumber(initialJlaMemberNumber ?? "")),
    [initialJlaMemberNumber]
  );

  useEffect(() => {
    setJlaMemberNumber(normalizeJlaMemberNumber(initialJlaMemberNumber ?? ""));
  }, [initialJlaMemberNumber]);

  useEffect(() => {
    setCheckedTemplateIds(checkedSetFromServer(templates, linkedTemplateIds));
  }, [linkedTemplateIds, templates]);

  const linkedTemplateIdSet = useMemo(() => new Set(linkedTemplateIds), [linkedTemplateIds]);
  const lockedTemplateIdSet = useMemo(() => new Set(lockedTemplateIds), [lockedTemplateIds]);
  const lockedTemplateIdSetForUi = useMemo(() => {
    const next = new Set<string>();
    for (const template of templates) {
      if (lockedTemplateIdSet.has(template.id)) {
        next.add(template.id);
      }
    }
    return next;
  }, [lockedTemplateIdSet, templates]);

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

  const toggle = (templateId: string) => {
    if (lockedTemplateIdSetForUi.has(templateId)) return;
    setCheckedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  const selectAll = () => {
    setCheckedTemplateIds(new Set(templates.map((t) => t.id)));
  };
  const clearAll = () => setCheckedTemplateIds(new Set(lockedTemplateIdSetForUi));
  const selectDomain = (domain: string) => {
    const rows = grouped.map.get(domain) ?? [];
    setCheckedTemplateIds((prev) => new Set([...prev, ...rows.map((r) => r.id)]));
  };
  const clearDomain = (domain: string) => {
    const rows = grouped.map.get(domain) ?? [];
    const domainSet = new Set(rows.map((r) => r.id));
    setCheckedTemplateIds((prev) => {
      const next = new Set([...prev]);
      for (const templateId of domainSet) {
        if (!lockedTemplateIdSetForUi.has(templateId)) next.delete(templateId);
      }
      return next;
    });
  };

  const persist = useCallback(async () => {
    const templateIds = [...checkedTemplateIds];
    if (templateIds.length > 0 && !accountJlaLinked) {
      const c = normalizeJlaMemberNumber(jlaMemberNumber);
      if (!isValidJlaMemberNumber(c)) {
        toast.error("JLAメンバーIDは500から始まる半角9桁の数字で入力してください");
        return;
      }
    }

    setSubmitting(true);
    try {
      const body: { templateIds: string[]; jlaMemberNumber?: string } = { templateIds };
      if (templateIds.length > 0 && !accountJlaLinked) {
        body.jlaMemberNumber = normalizeJlaMemberNumber(jlaMemberNumber);
      }
      const res = await fetch("/api/users/me/qualifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) {
        throw new Error(userFacingApiErrorMessage(data, "保存に失敗しました"));
      }
      toast.success("申請資格を保存しました");
      router.push(appRoutes.dashboard());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }, [accountJlaLinked, checkedTemplateIds, jlaMemberNumber, router]);

  const checkedCount = checkedTemplateIds.size;

  return (
    <div className="space-y-5" id="qual-checklist">
      <div
        className={cn(
          "rounded-2xl border border-border/55 bg-muted/20 px-4 py-4 sm:px-5",
          "grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center"
        )}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="資格名や前提条件で検索"
            className="h-10 bg-background/80 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <p className="text-xs text-muted-foreground">
            表示中{" "}
            <span className="font-semibold tabular-nums text-foreground">{grouped.total}</span> 件
            <span className="mx-2 text-border">·</span>
            チェック中{" "}
            <span className="font-semibold tabular-nums text-foreground">{checkedCount}</span> 件
          </p>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={selectAll}>
              <CheckSquare className="mr-1 size-3.5" aria-hidden />
              全選択
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clearAll}>
              <Square className="mr-1 size-3.5" aria-hidden />
              すべて外す
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {grouped.domains.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">条件に一致する資格が見つかりませんでした。</p>
          </div>
        ) : (
          grouped.domains.map((domain) => {
            const rows = grouped.map.get(domain) ?? [];
            return (
              <section
                key={domain}
                className={cn(
                  "relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6",
                  "transition-[border-color,background-color] duration-200 hover:border-orange-200/70 hover:bg-orange-50/20 dark:hover:border-orange-900/45 dark:hover:bg-orange-950/10"
                )}
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-orange-500/8 dark:bg-orange-400/6"
                  aria-hidden
                />
                <div
                  className="absolute bottom-5 left-0 top-5 w-0.5 rounded-full bg-gradient-to-b from-orange-500/70 via-orange-400/30 to-transparent sm:bottom-6 sm:top-6"
                  aria-hidden
                />

                <div className="relative pl-3 sm:pl-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/45 pb-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {domain}
                      </p>
                      <h2 className="mt-1 text-base font-semibold text-foreground">
                        {domainLabelMap[domain] ?? domain}
                      </h2>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => selectDomain(domain)}
                      >
                        この領域を選択
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => clearDomain(domain)}
                      >
                        この領域を解除
                      </Button>
                    </div>
                  </div>

                  <ul className="grid gap-3">
                    {rows.map((template) => {
                      const label = qualificationJapaneseLabel(template.kind, template.name);
                      const linked = linkedTemplateIdSet.has(template.id);
                      const locked = lockedTemplateIdSetForUi.has(template.id);
                      const checked = checkedTemplateIds.has(template.id);
                      return (
                        <li
                          key={template.id}
                          className={cn(
                            "rounded-xl border px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-200",
                            linked && checked
                              ? "border-emerald-300/70 bg-emerald-50/50 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-950/25"
                              : checked
                                ? "border-orange-300/70 bg-orange-50/40 shadow-sm dark:border-orange-800/60 dark:bg-orange-950/20"
                                : "border-border/60 bg-background/80 hover:border-border hover:bg-muted/20"
                          )}
                        >
                          <label
                            className={cn(
                              "flex items-start gap-3",
                              locked ? "cursor-not-allowed opacity-90" : "cursor-pointer"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={locked}
                              onChange={() => toggle(template.id)}
                              className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">{label}</span>
                                {linked ? (
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "border font-normal",
                                      locked
                                        ? "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                                        : "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                                    )}
                                  >
                                    {locked ? (
                                      <>
                                        <BadgeCheck className="mr-1 size-3" aria-hidden />
                                        公式資格
                                      </>
                                    ) : (
                                      "保存済み"
                                    )}
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="mt-2 flex flex-wrap gap-1.5">
                                {template.level ? (
                                  <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    区分: {template.level}
                                  </span>
                                ) : null}
                                {typeof template.minAge === "number" ? (
                                  <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    最低年齢: {template.minAge}歳
                                  </span>
                                ) : null}
                                <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {template.requiresExpiry && template.validityMonths
                                    ? `有効期間: ${template.validityMonths}か月`
                                    : "有効期限: なし"}
                                </span>
                              </span>
                              {template.prerequisiteExpression ? (
                                <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                                  前提条件: {qualificationJapaneseExpression(template.prerequisiteExpression)}
                                </span>
                              ) : template.prerequisiteKinds.length > 0 ? (
                                <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                                  前提条件:{" "}
                                  {qualificationJapaneseList(template.prerequisiteKinds).join(" / ")}
                                </span>
                              ) : null}
                              {template.nextKinds.length > 0 ? (
                                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                  次資格: {qualificationJapaneseList(template.nextKinds).join(" / ")}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            );
          })
        )}
      </div>

      {!accountJlaLinked && checkedCount > 0 ? (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-5 dark:border-amber-900/60 dark:bg-amber-950/25 sm:px-6"
          )}
          id="qual-save-requires-jla"
        >
          <div
            className="absolute bottom-4 left-0 top-4 w-0.5 rounded-full bg-gradient-to-b from-amber-500/70 via-amber-400/30 to-transparent sm:bottom-5 sm:top-5"
            aria-hidden
          />
          <div className="relative pl-3 sm:pl-4">
            <p className="text-base font-semibold text-amber-950 dark:text-amber-100">
              JLAメンバーIDがアカウントに未登録です
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-950/85 dark:text-amber-100/85">
              資格を保存するには、協会発行のメンバーIDが必要です。マイページの「資格の管理」でJLAメンバーIDを登録済みならページを再表示すると反映され、この欄は不要になります。
            </p>
            <div className="mt-4 max-w-xs space-y-2">
              <Label htmlFor="qual-inline-jla-id">JLAメンバーID（保存時に必須）</Label>
              <Input
                id="qual-inline-jla-id"
                value={jlaMemberNumber}
                onChange={(e) => setJlaMemberNumber(normalizeJlaMemberNumber(e.target.value))}
                numericInput="integer"
                maxLength={9}
                placeholder="500123456"
                inputMode="numeric"
                autoComplete="off"
                className="bg-background/90 font-mono"
              />
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                500から始まる半角9桁の数字で入力してください。
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "sticky bottom-3 z-20 rounded-2xl border border-border/55 bg-background/95 px-5 py-4 shadow-sm backdrop-blur sm:px-6",
          "flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        )}
      >
        <p className="text-center text-xs text-muted-foreground sm:text-left sm:text-sm">
          チェックした資格を保存すると、ダッシュボードへ移動します。
        </p>
        <Button type="button" onClick={() => void persist()} disabled={submitting} className="sm:min-w-[8rem]">
          <Save className="mr-1.5 size-4" aria-hidden />
          {submitting ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
