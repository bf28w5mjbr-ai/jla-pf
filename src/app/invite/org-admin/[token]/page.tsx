"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appendRedirectQuery } from "@/lib/postLoginRedirect";
import { membershipRoleLabelJa } from "@/lib/membershipDisplay";

type InvitePayload = {
  invitation?: {
    status: string;
    role: string;
    organization: { id: string; name: string };
    inviterName?: string;
  };
  error?: string;
};

export default function OrgAdminInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";
  const returnPath = `/invite/org-admin/${encodeURIComponent(token)}`;

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
          fetch(`/api/org-admin-invitations/${encodeURIComponent(token)}`),
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
      const res = await fetch(`/api/org-admin-invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        organizationId?: string;
      };
      if (res.status === 401) {
        router.push(appendRedirectQuery("/login", returnPath));
        toast.message("ログインが必要です", {
          description: "ログイン後、このページに戻って承諾してください。",
        });
        return;
      }
      if (!res.ok) {
        toast.error(body.error || "承諾に失敗しました");
        return;
      }
      toast.success("招待を承諾しました");
      if (body.organizationId) {
        router.push(`/organizations/${body.organizationId}`);
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/org-admin-invitations/${encodeURIComponent(token)}/decline`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        router.push(appendRedirectQuery("/login", returnPath));
        return;
      }
      if (!res.ok) {
        toast.error(body.error || "辞退に失敗しました");
        return;
      }
      toast.success("招待を辞退しました");
      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted-foreground">
        読み込み中…
      </div>
    );
  }

  const inv = data?.invitation;
  if (data?.error || !inv) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>招待が見つかりません</CardTitle>
            <CardDescription>{data?.error ?? "リンクの有効期限が切れている可能性があります。"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard">ダッシュボードへ</Link>
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
            <CardTitle>処理済みの招待です</CardTitle>
            <CardDescription>この招待はすでに {inv.status} です。</CardDescription>
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
          <CardTitle>主催団体への招待</CardTitle>
          <CardDescription>
            {inv.inviterName ? `${inv.inviterName} さんから` : ""}
            「{inv.organization.name}」の管理メンバー（
            {membershipRoleLabelJa(inv.role)}）として招待されています。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          {!authenticated ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href={appendRedirectQuery("/login", returnPath)}>ログインして承諾</Link>
            </Button>
          ) : (
            <>
              <Button onClick={onAccept} disabled={busy} className="w-full sm:w-auto">
                {busy ? "処理中…" : "承諾する"}
              </Button>
              <Button
                variant="outline"
                onClick={onDecline}
                disabled={busy}
                className="w-full sm:w-auto"
              >
                辞退する
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
