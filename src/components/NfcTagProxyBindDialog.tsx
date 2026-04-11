"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CandidateOption = { userId: string; label: string };

export function NfcTagProxyBindDialog({
  open,
  onOpenChange,
  competitionId,
  eventId,
  nfcTagId,
  onBound,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitionId: string;
  eventId: string;
  nfcTagId: string;
  onBound: () => void;
}) {
  const [options, setOptions] = useState<CandidateOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [reason, setReason] = useState("スタートリストでNFC読取時に代理紐付け");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !eventId) return;
    setLoadError(null);
    setLoadingList(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/competitions/${competitionId}/day-ops/participant-statuses?eventId=${encodeURIComponent(eventId)}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          candidates?: {
            individuals?: { userId: string; label: string }[];
            teams?: { memberUsers?: { userId: string; label: string }[] }[];
          };
        };
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "出場者一覧の取得に失敗しました");
        }
        const individuals = data.candidates?.individuals ?? [];
        const teamMembers = (data.candidates?.teams ?? []).flatMap((t) => t.memberUsers ?? []);
        const merged: CandidateOption[] = [
          ...individuals.map((i) => ({ userId: i.userId, label: i.label })),
          ...teamMembers.map((m) => ({ userId: m.userId, label: m.label })),
        ];
        const seen = new Set<string>();
        const deduped = merged.filter((o) => {
          if (seen.has(o.userId)) return false;
          seen.add(o.userId);
          return true;
        });
        deduped.sort((a, b) => a.label.localeCompare(b.label, "ja"));
        setOptions(deduped);
        setSelectedUserId(deduped[0]?.userId ?? "");
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "取得に失敗しました");
        setOptions([]);
        setSelectedUserId("");
      } finally {
        setLoadingList(false);
      }
    })();
  }, [open, competitionId, eventId]);

  const submit = useCallback(async () => {
    if (!selectedUserId || !nfcTagId.trim()) {
      toast.error("ユーザーを選択してください");
      return;
    }
    const r = reason.trim();
    if (r.length < 1) {
      toast.error("理由を入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/day-ops/nfc-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          nfcTagId,
          reason: r,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "紐付けに失敗しました");
      }
      toast.success("NFCタグを紐付けました。もう一度かざしてください。");
      onBound();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "紐付けに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }, [competitionId, nfcTagId, onBound, onOpenChange, reason, selectedUserId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>NFCタグの紐付け</DialogTitle>
          <DialogDescription>
            読み取ったタグにユーザーがまだ紐付いていません。この大会・種目の出場者を選んで紐付けてください（主催管理者またはレコーダー）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>タグID</Label>
            <Input value={nfcTagId} readOnly className="font-mono text-xs" />
          </div>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">出場者を読み込み中…</p>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">この種目に紐付け可能な出場者がいません。</p>
          ) : (
            <div className="space-y-1">
              <Label>紐付けるユーザー</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="ユーザーを選択" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.userId} value={o.userId}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>理由（監査用）</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || loadingList || !!loadError || options.length === 0 || !selectedUserId}
          >
            {submitting ? "保存中…" : "紐付けて続行"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
