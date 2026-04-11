"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, UserPlus } from "lucide-react";
import { userFacingApiErrorMessage } from "@/lib/userFacingApiError";

export type HostInviteEventOption = {
  id: string;
  name: string;
  sex: string;
  requiresEntryTime: boolean;
};

type SearchUser = {
  id: string;
  displayName: string;
  email: string;
  phoneNumber: string | null;
};

const sexLabel = (sex: string) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

type Props = {
  competitionId: string;
  individualEvents: HostInviteEventOption[];
};

export default function CompetitionHostInviteEntryPanel({
  competitionId,
  individualEvents,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(() => new Set());
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(
            `/api/competitions/${competitionId}/entries/host-invite-user-search?q=${encodeURIComponent(term)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            toast.error(typeof data.error === "string" ? data.error : "検索に失敗しました");
            setResults([]);
            return;
          }
          const users = Array.isArray(data.users) ? data.users : [];
          setResults(
            users.filter(
              (u: unknown): u is SearchUser =>
                !!u &&
                typeof u === "object" &&
                typeof (u as SearchUser).id === "string" &&
                typeof (u as SearchUser).displayName === "string"
            )
          );
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, competitionId]);

  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEvents = useMemo(
    () => individualEvents.filter((e) => selectedEventIds.has(e.id)),
    [individualEvents, selectedEventIds]
  );

  const canSubmit =
    selected &&
    selectedEvents.length > 0 &&
    selectedEvents.every((e) => !e.requiresEntryTime || (entryTimes[e.id]?.trim()?.length ?? 0) > 0);

  const handleSubmit = async () => {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    try {
      const items = selectedEvents.map((e) => ({
        eventId: e.id,
        entryTime: e.requiresEntryTime ? entryTimes[e.id]?.trim() || null : null,
      }));
      const res = await fetch(`/api/competitions/${competitionId}/entries/host-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          items,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(userFacingApiErrorMessage(data, "登録に失敗しました"));
        return;
      }
      toast.success(typeof data.message === "string" ? data.message : "登録しました");
      setSelected(null);
      setSelectedEventIds(new Set());
      setEntryTimes({});
      setNotes("");
      setQ("");
      setResults([]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (individualEvents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
        個人種目がないため、ここからの招待登録はできません。
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">招待・手動エントリー</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              登録済みユーザーを検索し、参加費なし（主催登録）で個人種目にエントリーします。対象者は事前に Bluvium
              に登録している必要があります。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">選手を検索</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="メール・電話・氏名の一部（2文字以上）"
              className="h-10 pl-9 pr-10"
              autoComplete="off"
            />
            {searching ? (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {q.trim().length >= 2 && results.length > 0 && !selected ? (
            <ul className="max-h-48 overflow-auto rounded-lg border border-border bg-background text-sm shadow-sm">
              {results.map((u) => (
                <li key={u.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition hover:bg-muted/60"
                    onClick={() => {
                      setSelected(u);
                      setResults([]);
                      setQ("");
                    }}
                  >
                    <span className="font-medium text-foreground">{u.displayName}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                    {u.phoneNumber ? (
                      <span className="font-mono text-[11px] text-muted-foreground">{u.phoneNumber}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {q.trim().length >= 2 && !searching && results.length === 0 && !selected ? (
            <p className="text-xs text-muted-foreground">該当するユーザーがいません。</p>
          ) : null}
        </div>

        {selected ? (
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">選択中</p>
                <p className="text-sm font-semibold">{selected.displayName}</p>
                <p className="text-xs text-muted-foreground">{selected.email}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelected(null)}>
                変更
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">個人種目（複数可）</p>
          <ul className="space-y-2">
            {individualEvents.map((ev) => {
              const checked = selectedEventIds.has(ev.id);
              return (
                <li
                  key={ev.id}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition hover:bg-muted/35"
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(ev.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-border"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground">{ev.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">（{sexLabel(ev.sex)}）</span>
                      {ev.requiresEntryTime ? (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={entryTimes[ev.id] ?? ""}
                            onChange={(e) =>
                              setEntryTimes((prev) => ({ ...prev, [ev.id]: e.target.value }))
                            }
                            placeholder="エントリータイム（必須）"
                            className="h-9 max-w-xs text-sm"
                            disabled={!checked}
                          />
                        </div>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">メモ（任意・内部用）</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例: 招待選手、海外からの参加 など"
            className="h-10"
            maxLength={2000}
          />
        </div>

        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!canSubmit || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              登録中…
            </>
          ) : (
            "エントリーを登録する"
          )}
        </Button>
      </div>
    </div>
  );
}
