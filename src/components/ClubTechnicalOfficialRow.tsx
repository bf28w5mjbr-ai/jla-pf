"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { CheckCircle2, TriangleAlert, Users } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <p className="text-xs text-muted-foreground">
        「{competitionName}」のテクニカルオフィシャル情報を読み込み中…
      </p>
    );
  }

  if (loadError) {
    return (
      <p className="text-xs text-destructive" role="alert">
        「{competitionName}」: {loadError}
      </p>
    );
  }

  if (!data?.status) {
    return (
      <p className="text-xs text-muted-foreground">
        「{competitionName}」のTO設定情報を表示できません。
      </p>
    );
  }

  if (!data.configured) {
    return (
      <Card className="border-dashed border-border/80 bg-muted/15">
        <CardContent className="space-y-1 px-4 py-4">
          <p className="text-sm font-medium text-foreground">主催者のTO人数設定待ち</p>
          <p className="text-xs text-muted-foreground">
            TO募集はONですが、必要人数の段階設定が未保存です。主催者が設定を保存すると、このカードに不足人数と依頼操作が表示されます。
          </p>
        </CardContent>
      </Card>
    );
  }

  const st = data.status;
  const pendingInvites = (data.invitations ?? []).filter((i) => i.status === "PENDING");
  const fulfilledRate =
    st.required > 0 ? Math.min(100, Math.round((st.assigned / st.required) * 100)) : 100;

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

  return (
    <Card className="border-border/80">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-base font-semibold">TO依頼状況</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          <span className="block text-muted-foreground">
            件数は<strong className="font-medium text-foreground">当クラブの個人エントリー合計（キャンセル除く）</strong>
            。チーム種目の件数は含みません。段階は<strong className="font-medium text-foreground">最も高い閾値の行のみ</strong>
            適用されます。
          </span>
          <span className="mt-1.5 block text-muted-foreground">
            メンバーが大会のオフィシャル応募で「TOとして応募」し保存した場合は、ここから依頼しなくても任命が付き、充足人数に含まれます（招待で付いた任命と合わせて数えます）。
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3.5 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={st.shortage > 0 ? "outline" : "secondary"}>
            {st.shortage > 0 ? `不足 ${st.shortage}人` : "充足済み"}
          </Badge>
          <Badge variant="outline">必要 {st.required}人</Badge>
          <Badge variant="outline">充足 {st.assigned}人</Badge>
          <Badge variant="outline">充足率 {fulfilledRate}%</Badge>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
          <p>
            資格要件:{" "}
            <span className="font-medium text-foreground">
              {st.qualificationFilterEnabled ? "オフィシャル資格要件設定を適用" : "制限なし"}
            </span>
          </p>
          <p className="mt-0.5">
            個人エントリー合計 {st.entryCount} 件 → 必要 {st.required} 人 / 充足 {st.assigned} 人
          </p>
        </div>

        {st.tiers.length > 0 ? (
          <ul className="rounded-lg border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
            {st.tiers.map((t, i) => (
              <li key={i} className={i > 0 ? "mt-1" : undefined}>
                個人エントリー合計 {t.minEntries} 件以上 → {t.requiredCount} 人
              </li>
            ))}
          </ul>
        ) : null}

        {isClubAdmin && st.shortage > 0 ? (
          <div className="space-y-3 border-t border-border/60 pt-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden />
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
          <div className="space-y-2 border-t border-border/60 pt-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              保留中の招待（{pendingInvites.length}件）
            </p>
            <ul className="space-y-2 text-xs">
              {pendingInvites.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
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

        {st.shortage <= 0 ? (
          <p className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            現在の必要人数を満たしています。
          </p>
        ) : null}

        <Button variant="outline" size="sm" className="h-8 w-fit text-xs" asChild>
          <Link href={appRoutes.competitions.root(competitionId)}>大会ページを開く</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
