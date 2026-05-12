"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
    if (!smsPhone.trim()) {
      toast.error("携帯番号を入力してください");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/competitions/${competitionId}/technical-official/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smsPhone: smsPhone.trim() }),
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
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">SMS（携帯番号）</Label>
              <Input
                className="h-10"
                placeholder="09012345678"
                value={smsPhone}
                onChange={(e) => setSmsPhone(e.target.value)}
                inputMode="tel"
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
