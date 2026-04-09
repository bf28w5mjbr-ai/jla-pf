"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

export type BalanceSheetLineDTO = {
  id: string;
  lineDate: string;
  accountSubject: string;
  kind: "INCOME" | "EXPENSE";
  amount: number;
  notes: string | null;
};

const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const kindLabel = (k: BalanceSheetLineDTO["kind"]) => (k === "INCOME" ? "収入" : "支出");

type Props = {
  competitionId: string;
  initialLines: BalanceSheetLineDTO[];
};

const fieldClass = "h-8 text-sm";

export function CompetitionBalanceSheetPanel({ competitionId, initialLines }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lineDate, setLineDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [accountSubject, setAccountSubject] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const rowsWithBalance = useMemo(() => {
    let running = 0;
    return initialLines.map((line) => {
      running += line.kind === "INCOME" ? line.amount : -line.amount;
      return { line, running };
    });
  }, [initialLines]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error("金額は1円以上の整数で入力してください");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/balance-sheet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineDate,
            accountSubject,
            kind,
            amount: parsed,
            notes: notes.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "登録に失敗しました");
        }
        toast.success("登録しました");
        setAccountSubject("");
        setAmount("");
        setNotes("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "登録に失敗しました");
      }
    });
  };

  const removeLine = (lineId: string) => {
    if (!confirm("この行を削除しますか？")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/balance-sheet/${lineId}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "削除に失敗しました");
        }
        toast.success("削除しました");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "削除に失敗しました");
      }
    });
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={submit}
        className="rounded-md border border-dashed border-border bg-background/80 p-2.5"
      >
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
          <div className="grid w-[9.5rem] shrink-0 gap-0.5">
            <Label htmlFor="bs-date" className="text-[11px] text-muted-foreground">
              日付
            </Label>
            <Input
              id="bs-date"
              type="date"
              className={fieldClass}
              value={lineDate}
              onChange={(e) => setLineDate(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="grid min-w-[8rem] flex-1 gap-0.5 sm:min-w-[12rem]">
            <Label htmlFor="bs-subject" className="text-[11px] text-muted-foreground">
              科目
            </Label>
            <Input
              id="bs-subject"
              className={fieldClass}
              value={accountSubject}
              onChange={(e) => setAccountSubject(e.target.value)}
              placeholder="会場費・補助金など"
              maxLength={200}
              required
              disabled={isPending}
            />
          </div>
          <div className="grid w-[6.5rem] shrink-0 gap-0.5">
            <Label className="text-[11px] text-muted-foreground">収支</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as "INCOME" | "EXPENSE")}
              disabled={isPending}
            >
              <SelectTrigger className={`${fieldClass} w-full`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INCOME">収入</SelectItem>
                <SelectItem value="EXPENSE">支出</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-[6.5rem] shrink-0 gap-0.5">
            <Label htmlFor="bs-amount" className="text-[11px] text-muted-foreground">
              金額（円）
            </Label>
            <Input
              id="bs-amount"
              className={fieldClass}
              numericInput="integer"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              required
              disabled={isPending}
            />
          </div>
          <div className="grid min-w-[6rem] flex-1 gap-0.5">
            <Label htmlFor="bs-notes" className="text-[11px] text-muted-foreground">
              備考
            </Label>
            <Input
              id="bs-notes"
              className={fieldClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="任意"
              maxLength={5000}
              disabled={isPending}
            />
          </div>
          <Button type="submit" size="sm" className="h-8 shrink-0 px-3" disabled={isPending}>
            {isPending ? "…" : "登録"}
          </Button>
        </div>
      </form>

      {initialLines.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">行がありません。上のフォームから追加してください。</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="whitespace-nowrap px-2 py-1.5 font-medium">日付</th>
                <th className="px-2 py-1.5 font-medium">科目</th>
                <th className="whitespace-nowrap px-2 py-1.5 font-medium">収支</th>
                <th className="whitespace-nowrap px-2 py-1.5 font-medium">金額</th>
                <th className="min-w-[100px] px-2 py-1.5 font-medium">備考</th>
                <th className="whitespace-nowrap px-2 py-1.5 font-medium">累計</th>
                <th className="w-8 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rowsWithBalance.map(({ line, running }) => (
                <tr key={line.id} className="border-b border-border/80 last:border-0 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-2 py-1 align-middle text-muted-foreground">
                    {line.lineDate}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1 align-middle">{line.accountSubject}</td>
                  <td className="whitespace-nowrap px-2 py-1 align-middle">
                    <span
                      className={
                        line.kind === "INCOME"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-700 dark:text-rose-400"
                      }
                    >
                      {kindLabel(line.kind)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 align-middle font-medium tabular-nums">
                    {formatYen(line.amount)}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1 align-middle text-muted-foreground">
                    {line.notes?.trim() || "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 align-middle font-medium tabular-nums">
                    {formatYen(running)}
                  </td>
                  <td className="px-1 py-0.5 align-middle">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => removeLine(line.id)}
                      aria-label="削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
