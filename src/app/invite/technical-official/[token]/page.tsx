"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appendRedirectQuery } from "@/lib/postLoginRedirect";

type InvitePayload = {
  invitation?: {
    status: string;
    competition: { id: string; name: string };
    club: { id: string; name: string };
    invitePhoneE164: string | null;
  };
  error?: string;
};

export default function TechnicalOfficialInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";
  const returnPath = `/invite/technical-official/${encodeURIComponent(token)}`;

  const [data, setData] = useState<InvitePayload | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [invRes, sessRes] = await Promise.all([
          fetch(`/api/technical-official-invitations/${encodeURIComponent(token)}`),
          fetch("/api/auth/session", { cache: "no-store" }),
        ]);
        const invJson = (await invRes.json()) as InvitePayload;
        const sessJson = (await sessRes.json()) as { authenticated?: boolean };
        if (!cancelled) {
          setData(invJson);
          setAuthenticated(Boolean(sessJson.authenticated));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>リンクが不正です</CardTitle>
            <CardDescription>招待URLをご確認ください。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const onAccept = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/technical-official-invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        router.push(appendRedirectQuery("/login", returnPath));
        toast.message("ログインが必要です", {
          description: "ログイン後、このページに戻って承認してください。",
        });
        return;
      }
      if (!res.ok) {
        toast.error(body.error || "承認に失敗しました");
        return;
      }
      toast.success("承認しました");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/technical-official-invitations/${encodeURIComponent(token)}/decline`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        router.push(appendRedirectQuery("/login", returnPath));
        toast.message("ログインが必要です", {
          description: "ログイン後、このページに戻って辞退できます。",
        });
        return;
      }
      if (!res.ok) {
        toast.error(body.error || "辞退に失敗しました");
        return;
      }
      toast.success("辞退しました");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <p className="text-center text-sm text-muted-foreground">読み込み中…</p>
      </div>
    );
  }

  const inv = data?.invitation;
  if (!inv || data?.error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>招待が見つかりません</CardTitle>
            <CardDescription>リンクの有効期限が切れているか、すでに処理済みの可能性があります。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={appendRedirectQuery("/login", returnPath)}>ログイン</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inv.status !== "PENDING") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>この招待はすでに処理されています</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">ダッシュボードへ</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>テクニカルオフィシャルの依頼</CardTitle>
          <CardDescription>
            {inv.club.name} より、大会「{inv.competition.name}」のテクニカルオフィシャルとしての依頼です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            承認するには、当該クラブの承認済みメンバーであり、主催者が指定した資格が有効である必要があります。
          </p>

          {!authenticated ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-sm font-medium text-foreground">まずログインまたは新規登録してください</p>
              <p className="text-xs text-muted-foreground">
                ログイン後は自動的にこのページへ戻れます（戻らない場合は同じリンクを開き直してください）。
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="w-full sm:w-auto" asChild>
                  <Link href={appendRedirectQuery("/login", returnPath)}>ログイン</Link>
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" asChild>
                  <Link href={appendRedirectQuery("/register", returnPath)}>新規登録</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={onAccept} disabled={busy}>
                承認する
              </Button>
              <Button type="button" variant="outline" onClick={onDecline} disabled={busy}>
                辞退する
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
