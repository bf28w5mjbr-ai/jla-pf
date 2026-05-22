"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert, User, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PhoneNumberField,
  validatePhoneFieldValue,
} from "@/components/ui/PhoneNumberField";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InvitationsPayload = {
  configured: boolean;
  status?: {
    qualificationFilterEnabled: boolean;
    entryCount: number;
    required: number;
    assigned: number;
    shortage: number;
    tiers: { minEntries: number; requiredCount: number }[];
    fulfillers?: { userId: string; familyName: string; givenName: string }[];
    diagnostics?: {
      assignmentCount: number;
      fallbackApprovedCount: number;
      approvedExaminedCount: number;
      approvedResolvedOtherClubCount: number;
      unresolvedApprovedCount: number;
      qualificationFilteredOutCount: number;
      duplicateUserSkippedCount: number;
    };
  };
  invitations?: {
    id: string;
    status: string;
    invitePhoneE164: string | null;
    smsInvite?: boolean;
    invitedUser: { id: string; familyName: string; givenName: string } | null;
    createdAt: string;
  }[];
  eligibleMembers?: { id: string; name: string }[];
  directAdd?: {
    allowed: boolean;
    closedReason?: string;
    closesAtLabel?: string;
  };
};

export default function ClubTechnicalOfficialRow({
  clubId,
  competitionId,
  competitionName,
  isClubAdmin,
}: {
  clubId: string;
  competitionId: string;
  competitionName: string;
  isClubAdmin: boolean;
}) {
  const [data, setData] = useState<InvitationsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string>("");
  const [smsPhone, setSmsPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [addToOpen, setAddToOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; displayName: string; email: string }[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    displayName: string;
    email: string;
  } | null>(null);
  const [directAddBusy, setDirectAddBusy] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(
      `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/invitations`,
      { cache: "no-store" }
    );
    const j = (await res.json()) as InvitationsPayload & { error?: string };
    if (!res.ok) {
      setData(null);
      setLoadError(j.error ?? "読み込みに失敗しました");
      return;
    }
    setData(j);
  }, [clubId, competitionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!addToOpen) return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    const handle = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      (async () => {
        setSearchLoading(true);
        setSearchError(null);
        try {
          const res = await fetch(
            `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/user-search?q=${encodeURIComponent(q)}`,
            { cache: "no-store", signal: ac.signal }
          );
          const j = (await res.json()) as {
            error?: string;
            users?: { id: string; displayName: string; email: string }[];
          };
          if (!res.ok) throw new Error(j.error ?? "検索に失敗しました");
          setSearchResults(j.users ?? []);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setSearchResults([]);
          setSearchError(e instanceof Error ? e.message : "検索に失敗しました");
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [addToOpen, searchQ, clubId, competitionId]);

  if (loading) {
    return (
      <div className="flex min-h-[4.5rem] items-center gap-2.5 rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span>「{competitionName}」の情報を読み込み中…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="rounded-lg border border-destructive/35 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive"
        role="alert"
        aria-live="polite"
      >
        <span className="font-medium">「{competitionName}」</span>
        <span className="text-destructive/90"> — {loadError}</span>
      </div>
    );
  }

  if (!data?.status) {
    return (
      <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
        「{competitionName}」のTO設定情報を表示できません。
      </p>
    );
  }

  if (!data.configured) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/35 bg-amber-500/[0.06] px-3.5 py-3.5 dark:border-amber-900/50 dark:bg-amber-950/25">
        <p className="text-sm font-medium text-foreground">主催者のTO人数設定待ち</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          TO募集はONですが、必要人数の段階設定が未保存です。主催者が設定を保存すると、ここに不足人数と依頼操作が表示されます。
        </p>
      </div>
    );
  }

  const st = data.status;
  const pendingInvites = (data.invitations ?? []).filter((i) => i.status === "PENDING");
  const fulfillers = st.fulfillers ?? [];

  const onInviteMember = async () => {
    if (!memberId) {
      toast.error("メンバーを選択してください");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberUserId: memberId }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "依頼に失敗しました");
      toast.success("依頼を送信しました");
      setMemberId("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "依頼に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const onSms = async () => {
    const phoneErr = validatePhoneFieldValue(smsPhone, true);
    if (phoneErr) {
      toast.error(phoneErr);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smsPhone }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "SMS送信に失敗しました");
      toast.success("SMSを送信しました");
      setSmsPhone("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SMS送信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const onCancelInvite = async (invitationId: string) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/invitations/${invitationId}`,
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "取り消しに失敗しました");
      toast.success("招待を取り消しました");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const directAddMeta = data.directAdd ?? { allowed: false as const };
  const directAddDisabledTitle =
    isClubAdmin && !directAddMeta.allowed
      ? [directAddMeta.closedReason, directAddMeta.closesAtLabel].filter(Boolean).join(" ") ||
        "現在は追加できません"
      : undefined;

  const onDirectAddOpenChange = (open: boolean) => {
    setAddToOpen(open);
    if (!open) {
      setSearchQ("");
      setSearchResults([]);
      setSearchError(null);
      setSelectedUser(null);
      searchAbortRef.current?.abort();
    }
  };

  const onDirectAddConfirm = async () => {
    if (!selectedUser) {
      toast.error("ユーザーを選択してください");
      return;
    }
    setDirectAddBusy(true);
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/direct-add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: selectedUser.id }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "追加に失敗しました");
      toast.success(`${selectedUser.displayName} をテクニカルオフィシャルに追加しました`);
      onDirectAddOpenChange(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setDirectAddBusy(false);
    }
  };

  const shortage = st.shortage > 0;
  const shortageTone = shortage
    ? "border-rose-500/40 bg-rose-500/[0.06] ring-rose-500/15 dark:border-rose-500/35 dark:bg-rose-950/25 dark:ring-rose-900/30"
    : "border-emerald-500/35 bg-emerald-500/[0.08] ring-emerald-500/15 dark:border-emerald-800/45 dark:bg-emerald-950/30 dark:ring-emerald-900/25";

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border p-3.5 text-sm shadow-sm ring-1 ring-inset sm:p-4",
        shortageTone
      )}
      role="region"
      aria-label={
        shortage
          ? `テクニカルオフィシャル不足（必要${st.required}人、充足${st.assigned}人）`
          : `テクニカルオフィシャル充足（必要${st.required}人、充足${st.assigned}人）`
      }
    >
      <div className="grid max-w-md grid-cols-2 gap-2.5">
        <div className="rounded-lg border border-border/50 bg-background/55 px-3 py-2.5 shadow-sm dark:bg-background/40">
          <p className="text-[11px] font-medium text-muted-foreground">必要</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">
            {st.required}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">人</span>
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/55 px-3 py-2.5 shadow-sm dark:bg-background/40">
          <p className="text-[11px] font-medium text-muted-foreground">充足</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">
            {st.assigned}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">人</span>
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">登録されているTO</p>
        {fulfillers.length > 0 ? (
          <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-background/40 dark:divide-border/30 dark:bg-background/30">
            {fulfillers.map((f) => (
              <li key={f.userId}>
                <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground">
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    {f.familyName} {f.givenName}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-3 text-center text-xs text-muted-foreground">
            まだいません
          </p>
        )}
      </div>

      {isClubAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={!directAddMeta.allowed || directAddBusy}
            title={directAddDisabledTitle}
            onClick={() => onDirectAddOpenChange(true)}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            TO追加
          </Button>
          {!directAddMeta.allowed && directAddMeta.closedReason ? (
            <p className="text-xs text-muted-foreground">{directAddMeta.closedReason}</p>
          ) : null}
          <Dialog open={addToOpen} onOpenChange={onDirectAddOpenChange}>
            <DialogContent className="max-h-[min(90vh,32rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>テクニカルオフィシャルを追加</DialogTitle>
                <DialogDescription>
                  ユーザー名・メールなどで検索し、選択して追加します。クラブ外のユーザーも指定できます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="to-direct-add-search" className="text-xs">
                    検索
                  </Label>
                  <Input
                    id="to-direct-add-search"
                    value={searchQ}
                    onChange={(e) => {
                      setSearchQ(e.target.value);
                      setSelectedUser(null);
                    }}
                    placeholder="2文字以上（氏名・メールなど）"
                    autoComplete="off"
                  />
                </div>
                {searchLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    検索中…
                  </div>
                ) : null}
                {searchError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {searchError}
                  </p>
                ) : null}
                {searchResults.length > 0 ? (
                  <ul
                    className="max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/10 text-sm"
                    role="listbox"
                    aria-label="検索結果"
                  >
                    {searchResults.map((u) => {
                      const selected = selectedUser?.id === u.id;
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent/60",
                              selected && "bg-accent/80"
                            )}
                            onClick={() => setSelectedUser(u)}
                          >
                            <span className="font-medium text-foreground">{u.displayName}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : searchQ.trim().length >= 2 && !searchLoading && !searchError ? (
                  <p className="text-xs text-muted-foreground">該当するユーザーがいません</p>
                ) : null}
                {selectedUser ? (
                  <p className="rounded-md border border-primary/25 bg-primary/[0.06] px-3 py-2 text-xs text-foreground">
                    追加対象: <span className="font-medium">{selectedUser.displayName}</span>
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={directAddBusy}
                  onClick={() => onDirectAddOpenChange(false)}
                >
                  キャンセル
                </Button>
                <Button type="button" disabled={!selectedUser || directAddBusy} onClick={onDirectAddConfirm}>
                  {directAddBusy ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                      追加中…
                    </>
                  ) : (
                    "追加する"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {isClubAdmin && st.shortage > 0 ? (
        <div className="space-y-3 rounded-lg border border-border/50 bg-background/45 p-3 shadow-sm dark:bg-background/35">
          <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="h-3.5 w-3.5 text-primary" aria-hidden />
            依頼
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">資格のあるメンバーへ</Label>
              <Select value={memberId || undefined} onValueChange={setMemberId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="メンバーを選択" />
                </SelectTrigger>
                <SelectContent>
                  {(data.eligibleMembers ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" size="sm" disabled={busy} onClick={onInviteMember}>
              依頼を送る
            </Button>
          </div>
          {(data.eligibleMembers ?? []).length === 0 ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-100">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              条件を満たすクラブメンバーがいません。SMS招待を利用してください。
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <PhoneNumberField
                id="to-invite-sms-phone"
                label="SMS（携帯番号）"
                value={smsPhone}
                onChange={setSmsPhone}
                mobileOnly
                hint="SMSで招待できる携帯電話番号"
              />
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSms}>
              SMSを送る
            </Button>
          </div>
        </div>
      ) : null}

      {pendingInvites.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">
            保留中の招待（{pendingInvites.length}件）
          </p>
          <ul className="space-y-2 text-xs">
            {pendingInvites.map((i) => (
              <li
                key={i.id}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:bg-background/40"
              >
                <span>
                  {i.invitedUser
                    ? `${i.invitedUser.familyName} ${i.invitedUser.givenName}`
                    : i.invitePhoneE164
                      ? `SMS: ${i.invitePhoneE164}`
                      : i.smsInvite
                        ? "SMS招待"
                        : "招待"}
                </span>
                {isClubAdmin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive"
                    disabled={busy}
                    onClick={() => onCancelInvite(i.id)}
                  >
                    取り消し
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
