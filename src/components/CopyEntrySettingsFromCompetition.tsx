"use client";

import { Copy, Library } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SiblingCompetitionOption = {
  id: string;
  name: string;
  startDate: string;
};

export default function CopyEntrySettingsFromCompetition({
  competitionId,
  siblings,
  canCopy,
  blockedReason,
}: {
  competitionId: string;
  siblings: SiblingCompetitionOption[];
  canCopy: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState<string>("");
  const [pending, setPending] = useState(false);

  if (siblings.length === 0) {
    return null;
  }

  const onCopy = async () => {
    if (!sourceId) {
      toast.error("コピー元の大会を選んでください");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/copy-entry-settings-from`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCompetitionId: sourceId }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || "コピーに失敗しました");
      }
      toast.success("種目と参加費をコピーしました");
      router.refresh();
      setSourceId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "コピーに失敗しました");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Library className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">他の大会からコピー</p>
          <p className="text-xs text-muted-foreground">
            同一主催の別大会から種目と参加費を取り込みます。エントリーがない大会のみ。
          </p>
        </div>
      </div>
      {!canCopy && blockedReason ? (
        <p
          className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
          role="status"
        >
          {blockedReason}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Select
          value={sourceId || undefined}
          onValueChange={setSourceId}
          disabled={!canCopy || pending}
        >
          <SelectTrigger className="h-10 w-full min-h-10 sm:max-w-md">
            <SelectValue placeholder="コピー元の大会を選択" />
          </SelectTrigger>
          <SelectContent>
            {siblings.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  （
                  {new Date(s.startDate).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  ）
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-10 shrink-0 gap-1.5 sm:min-w-[7.5rem]"
          disabled={!canCopy || !sourceId || pending}
          onClick={() => void onCopy()}
        >
          <Copy className="h-3.5 w-3.5 opacity-80" aria-hidden />
          {pending ? "コピー中…" : "コピーする"}
        </Button>
      </div>
    </div>
  );
}
