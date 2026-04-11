"use client";

import { useState } from "react";
import { ClipboardList, KeyRound, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateUserAgent } from "@/lib/securityDisplay";
import { cn } from "@/lib/utils";

type LookupMeta = {
  channel?: string;
  ipMasked?: string;
  uaPrefix?: string;
};

type LoginAuditRow = {
  id: string;
  createdAt: string;
  meta: unknown;
};

type UserPayload = {
  id: string;
  familyName: string;
  givenName: string;
  email: string;
  phoneMasked: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginUa: string | null;
  passkeyCount: number;
};

export default function AdminUserSecurityLookup() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserPayload | null>(null);
  const [audits, setAudits] = useState<LoginAuditRow[]>([]);

  const runLookup = async () => {
    setError(null);
    setUser(null);
    setAudits([]);
    const term = q.trim();
    if (term.length < 3) {
      setError("3文字以上入力してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/security-lookup?q=${encodeURIComponent(term)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "照会に失敗しました");
        return;
      }
      setUser(data.user as UserPayload);
      setAudits((data.loginAudits as LoginAuditRow[]) ?? []);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">ユーザー検索</CardTitle>
          </div>
          <CardDescription>
            ユーザー ID（cuid）またはメールアドレス。個人情報の取り扱いに注意してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <AutofillSyncForm
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void runLookup();
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="admin-user-q">検索語</Label>
              <Input
                id="admin-user-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ユーザーID または メール"
                autoComplete="off"
                className="font-mono text-sm"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full shrink-0 sm:w-auto sm:min-w-[7rem]">
              {loading ? "検索中…" : "照会"}
            </Button>
          </AutofillSyncForm>
          {error ? (
            <div
              className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {user ? (
        <>
          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                  <CardTitle className="text-lg">アカウント概要</CardTitle>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  パスキー {user.passkeyCount} 件
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4 sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">氏名</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {user.familyName} {user.givenName}
                  </dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                  <dt className="text-xs font-medium text-muted-foreground">メール</dt>
                  <dd className="mt-1 break-all text-sm text-foreground">{user.email}</dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                  <dt className="text-xs font-medium text-muted-foreground">電話（マスク）</dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">{user.phoneMasked}</dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4 sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">ユーザー ID</dt>
                  <dd className="mt-1 break-all rounded-md bg-background/80 px-2 py-1.5 font-mono text-xs text-foreground">
                    {user.id}
                  </dd>
                </div>
              </dl>

              <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden />
                  記録上の最終ログイン（User テーブル）
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">日時</dt>
                    <dd className="mt-0.5 font-mono text-foreground">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ja-JP") : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">IP（生値・運用限定）</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                      {user.lastLoginIp ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">User-Agent</dt>
                    <dd className="mt-0.5 break-all rounded-md bg-background/80 px-2 py-1.5 text-xs leading-relaxed text-foreground">
                      {truncateUserAgent(user.lastLoginUa, 200)}
                    </dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">ログイン成功の監査ログ</CardTitle>
              </div>
              <CardDescription>
                USER_LOGIN_SUCCESS（最新40件）。IP はマスク済みで記録されています。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {audits.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  まだ記録がありません
                </p>
              ) : (
                <ul className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {audits.map((a) => {
                    const m = (a.meta && typeof a.meta === "object" ? a.meta : {}) as LookupMeta;
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          "rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm",
                          "border-l-4 border-l-primary/50"
                        )}
                      >
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString("ja-JP")}
                        </p>
                        <p className="mt-2 text-sm">
                          <span className="text-muted-foreground">経路: </span>
                          <span className="font-medium text-foreground">{m.channel ?? "—"}</span>
                        </p>
                        <p className="mt-1 font-mono text-xs text-foreground">
                          IP: {m.ipMasked ?? "—"}
                        </p>
                        <p className="mt-2 break-all rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                          UA: {m.uaPrefix ?? "—"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
