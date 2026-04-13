"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Save, Square } from "lucide-react";
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

function checkedSetFromServer(templates: TemplateRow[], linkedKinds: string[]): Set<string> {
  const linkedNorm = linkedKinds.map((k) => normalizeQualificationKind(k));
  const next = new Set<string>();
  for (const t of templates) {
    const tk = normalizeQualificationKind(t.kind);
    if (linkedNorm.some((ln) => ln === tk)) {
      next.add(t.kind);
    }
  }
  return next;
}

export default function QualificationsSelectionClient({
  templates,
  linkedKinds,
  initialJlaMemberNumber = null,
}: Props) {
  const router = useRouter();
  const [checkedKinds, setCheckedKinds] = useState<Set<string>>(() =>
    checkedSetFromServer(templates, linkedKinds)
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
    setCheckedKinds(checkedSetFromServer(templates, linkedKinds));
  }, [linkedKinds, templates]);

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

  const toggle = (kind: string) => {
    setCheckedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const selectAll = () => {
    setCheckedKinds(new Set(templates.map((t) => t.kind)));
  };
  const clearAll = () => setCheckedKinds(new Set());
  const selectDomain = (domain: string) => {
    const rows = grouped.map.get(domain) ?? [];
    setCheckedKinds((prev) => new Set([...prev, ...rows.map((r) => r.kind)]));
  };
  const clearDomain = (domain: string) => {
    const rows = grouped.map.get(domain) ?? [];
    const domainSet = new Set(rows.map((r) => r.kind));
    setCheckedKinds((prev) => {
      const next = new Set([...prev]);
      for (const kind of domainSet) next.delete(kind);
      return next;
    });
  };

  const persist = useCallback(async () => {
    const kinds = [...checkedKinds];
    if (kinds.length > 0 && !accountJlaLinked) {
      const c = normalizeJlaMemberNumber(jlaMemberNumber);
      if (!isValidJlaMemberNumber(c)) {
        toast.error("JLAメンバーIDは500から始まる半角9桁の数字で入力してください");
        return;
      }
    }

    setSubmitting(true);
    try {
      const body: { kinds: string[]; certNumber?: string } = { kinds };
      if (kinds.length > 0 && !accountJlaLinked) {
        body.certNumber = normalizeJlaMemberNumber(jlaMemberNumber);
      }
      const res = await fetch("/api/users/me/qualifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "保存に失敗しました");
      }
      toast.success("保有資格を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }, [accountJlaLinked, checkedKinds, jlaMemberNumber, router]);

  const checkedCount = checkedKinds.size;

  return (
    <div className="space-y-6" id="qual-checklist">
      <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-4 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-100">
        <p className="font-semibold">資格の紐づけ</p>
        <p className="mt-1 text-xs leading-relaxed">
          保有している資格にチェックを入れて「保存」すると、すぐにアカウントに反映されます（協会の承認は不要です）。JLA
          メンバーIDはアカウントに1つだけ登録します。
          <span className="font-medium text-foreground">
            アカウントにまだ紐づいていない場合は、資格を1件以上保存するときにIDの入力が必要です。すでに紐づけ済みの場合は入力不要です。
          </span>
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
          チェック中: <span className="font-semibold text-foreground">{checkedCount}</span> 件
        </p>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
            <CheckSquare className="mr-1 h-3.5 w-3.5" />
            全選択
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>
            <Square className="mr-1 h-3.5 w-3.5" />
            すべて外す
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
                    const checked = checkedKinds.has(template.kind);
                    return (
                      <li
                        key={template.id}
                        className={cn(
                          "rounded-xl border p-4 shadow-sm",
                          linked && checked
                            ? "border-emerald-300/70 bg-emerald-50/40 dark:border-emerald-800/70 dark:bg-emerald-950/20"
                            : checked
                              ? "border-primary/60 bg-primary/5"
                              : "border-border/80 bg-muted/10"
                        )}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
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
                                  保存済み
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

      {!accountJlaLinked && checkedCount > 0 ? (
        <div
          className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 dark:border-amber-900/60 dark:bg-amber-950/35"
          id="qual-save-requires-jla"
        >
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            JLAメンバーIDがアカウントに未登録です
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-950/85 dark:text-amber-100/85">
            資格を保存するには、協会発行のメンバーIDが必要です。マイページの「保有資格」でJLAメンバーIDを登録済みならページを再表示すると反映され、この欄は不要になります。
          </p>
          <div className="mt-3 max-w-xs space-y-2">
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
              className="font-mono"
            />
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
              500から始まる半角9桁の数字で入力してください。
            </p>
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-2 z-20 rounded-xl border border-border/80 bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" onClick={() => void persist()} disabled={submitting}>
            <Save className="mr-1 h-4 w-4" />
            {submitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
