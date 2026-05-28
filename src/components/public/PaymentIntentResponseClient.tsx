"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { appendRedirectQuery } from "@/lib/postLoginRedirect";

type PublicState = {
  valid: boolean;
  expired: boolean;
  alreadyResponded: boolean;
  competitionName: string;
  participantName: string;
  eventsLabel: string;
  responseDeadlineAt: string;
  totalFee: number;
  choice: string | null;
  entryCancelled: boolean;
};

type Props = {
  competitionId: string;
  token: string;
};

export default function PaymentIntentResponseClient({ competitionId, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"participate" | "withdraw" | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    choice: "participate" | "withdraw";
    entryPath: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/entry/payment-intent?token=${encodeURIComponent(token)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "読み込みに失敗しました");
      }
      setState(data as PublicState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [competitionId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (choice: "participate" | "withdraw") => {
    const confirmMsg =
      choice === "participate"
        ? "出場する場合、エントリーが成立します。大会当日までにお支払いが必要です。よろしいですか？"
        : "棄権する場合、エントリーは取消されます。よろしいですか？";
    if (!window.confirm(confirmMsg)) return;

    setSubmitting(choice);
    setError(null);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/entry/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, choice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "送信に失敗しました");
      }
      setDone({
        choice,
        entryPath:
          typeof data.entryPath === "string"
            ? data.entryPath
            : `/competitions/${competitionId}/entry`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSubmitting(null);
    }
  };

  const deadlineLabel = state
    ? new Date(state.responseDeadlineAt).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="ml-2 text-sm">読み込み中…</span>
      </div>
    );
  }

  if (error && !state) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (done) {
    const entryPath = done.entryPath;
    const loginHref = appendRedirectQuery("/login", entryPath);
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">
            {done.choice === "participate" ? "出場の意思を受け付けました" : "棄権を受け付けました"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          {done.choice === "participate" ? (
            <>
              <p>エントリーが成立しました。参加費は大会当日までにお支払いください。</p>
              <p className="text-muted-foreground">
                ログイン後、エントリー画面の「決済へ進む」からカード決済もできます。大会本部でのお支払いもご利用いただけます。
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button asChild>
                  <Link href={loginHref}>ログインしてエントリー画面へ</Link>
                </Button>
              </div>
            </>
          ) : (
            <p>エントリーは取消されました。ご不明点は大会主催者へお問い合わせください。</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!state) return null;

  const blocked =
    state.expired || state.entryCancelled || (state.alreadyResponded && !state.choice);

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">{state.competitionName}</CardTitle>
        <p className="text-sm text-muted-foreground">エントリー費・出場意思のご確認</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <dt className="text-xs text-muted-foreground">参加者</dt>
            <dd className="font-medium">{state.participantName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">出場種目</dt>
            <dd>{state.eventsLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">参加費</dt>
            <dd className="tabular-nums">¥{state.totalFee.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">回答期限</dt>
            <dd className="tabular-nums">{deadlineLabel}</dd>
          </div>
        </dl>

        {state.expired ? (
          <p className="text-amber-800 dark:text-amber-200">このリンクの有効期限が切れています。</p>
        ) : null}
        {state.entryCancelled ? (
          <p className="text-muted-foreground">このエントリーはすでに取消されています。</p>
        ) : null}
        {state.alreadyResponded ? (
          <p className="text-muted-foreground">
            すでにご回答済みです（
            {state.choice === "PARTICIPATE" ? "出場" : state.choice === "WITHDRAW" ? "棄権" : "—"}）。
          </p>
        ) : null}

        {error ? <p className="text-destructive">{error}</p> : null}

        {!blocked && state.valid ? (
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={submitting !== null}
              onClick={() => void submit("participate")}
            >
              {submitting === "participate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "出場する"
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={submitting !== null}
              onClick={() => void submit("withdraw")}
            >
              {submitting === "withdraw" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "棄権する"
              )}
            </Button>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-muted-foreground">
          出場を選択した場合、大会当日までに大会本部またはエントリー画面からお支払いください。棄権を選択した場合、エントリーは取消されます。
        </p>
      </CardContent>
    </Card>
  );
}
