import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { getAuthenticatedAppUser } from "@/lib/authenticatedLayoutData";
import { getCachedQualificationTemplates } from "@/lib/qualificationTemplateCache";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DashboardProfilePhotoLazy,
  NfcTagManagerLazy,
} from "./dashboardDynamicClients";
import { QualificationRecordOrigin } from "@prisma/client";
import { cn } from "@/lib/utils";

function calcAge(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export async function DashboardMain({ userId }: { userId: string }) {
  const [user, qualificationTemplates] = await Promise.all([
    getAuthenticatedAppUser(userId),
    getCachedQualificationTemplates(),
  ]);
  if (!user) redirect("/login");

  const clubStatusLabel = {
    APPROVED: "所属",
    PENDING: "申請中",
    REJECTED: "却下",
  } as const;

  const clubStatusClass = {
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    PENDING: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    REJECTED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  } as const;

  const qualificationLabelByKind = new Map<string, string>();
  for (const t of qualificationTemplates) {
    if (!qualificationLabelByKind.has(t.kind)) {
      qualificationLabelByKind.set(t.kind, t.name.trim() || t.kind);
    }
  }
  const qualificationDisplayLabel = (kind: string) => qualificationLabelByKind.get(kind) ?? kind;

  const applicationQualifications = user.qualifications.filter(
    (q) => q.recordOrigin === QualificationRecordOrigin.USER_APPLICATION
  );
  const heldQualifications = user.qualifications.filter(
    (q) => q.recordOrigin === QualificationRecordOrigin.ASSOCIATION_IMPORT
  );

  const qualificationStatusLabel = {
    APPROVED: "有効",
    PENDING: "審査中",
    REJECTED: "却下",
    EXPIRED: "期限切れ",
  } as const;
  const qualificationStatusClass = {
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    PENDING: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    REJECTED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
    EXPIRED: "border-border bg-muted text-muted-foreground",
  } as const;

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-border/80 pb-6 sm:pb-8">
        <div className="flex items-center gap-2 text-primary">
          <LayoutDashboard className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">マイページ</span>
        </div>
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          ダッシュボード
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          プロフィール・エントリー・所属クラブの状況をひと目で確認できます。
        </p>
      </header>

      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <div className="border-b border-border/80 bg-muted/20 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden />
              プロフィール
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                設定
              </Link>
            </Button>
          </div>
        </div>
        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-6 md:grid-cols-[88px_1fr]">
            <div className="flex justify-center md:justify-start">
              <DashboardProfilePhotoLazy
                currentPhotoUrl={user.profilePhotoUrl}
                userName={`${user.familyName}${user.givenName}`}
              />
            </div>
            <div className="min-w-0 space-y-5">
              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl lg:text-2xl">
                    {user.familyName} {user.givenName}
                  </h2>
                  <span className="text-sm text-muted-foreground">{calcAge(user.dateOfBirth)}歳</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  フリガナ：{user.familyNameKana} {user.givenNameKana}
                </p>
              </div>

              <div className="grid gap-5 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">所属クラブ</h3>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                      <Link href={appRoutes.profile.clubs()} aria-label="クラブを追加" title="クラブを追加">
                        <Plus className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.memberships.length === 0 && (
                      <p className="text-sm text-muted-foreground">未所属です。クラブ参加を申請できます。</p>
                    )}
                    {user.memberships.map((m) => (
                      <span
                        key={m.id}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm",
                          clubStatusClass[m.status]
                        )}
                        title={clubStatusLabel[m.status]}
                      >
                        <span title={m.club.abbreviation ? m.club.name : undefined}>
                          {m.club.abbreviation || m.club.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                    <dt className="font-medium text-muted-foreground">電話番号</dt>
                    <dd className="mt-0.5 font-mono text-foreground">{user.phoneNumber}</dd>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 sm:col-span-2">
                    <dt className="font-medium text-muted-foreground">メール</dt>
                    <dd className="mt-0.5 break-all font-mono text-foreground">{user.email}</dd>
                  </div>
                  {user.jlaMemberNumber ? (
                    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 sm:col-span-2">
                      <dt className="font-medium text-muted-foreground">JLA会員番号</dt>
                      <dd className="mt-0.5 font-mono text-foreground">{user.jlaMemberNumber}</dd>
                    </div>
                  ) : null}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">NFCタグ紐付け</h3>
                  <div className="mt-2 rounded-xl border border-border bg-background p-3">
                    <NfcTagManagerLazy initialNfcTagId={user.nfcTagId ?? null} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">資格</h3>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                      <Link href="/qualifications" aria-label="資格を選択" title="資格を選択">
                        <Plus className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-3 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground">申請資格</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {applicationQualifications.length === 0 && (
                          <p className="text-xs text-muted-foreground">申請資格はまだありません。</p>
                        )}
                        {applicationQualifications.map((q) => {
                          const expiryDate = q.expiryDate ? new Date(q.expiryDate) : null;
                          const now = new Date();
                          const isExpired = !!expiryDate && expiryDate.getTime() < now.getTime();
                          const isExpiringSoon =
                            !!expiryDate &&
                            !isExpired &&
                            expiryDate.getTime() - now.getTime() <= 1000 * 60 * 60 * 24 * 30;
                          const status = isExpired ? "EXPIRED" : q.status;

                          return (
                            <div key={q.id} className="relative inline-flex items-center gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm",
                                  qualificationStatusClass[status]
                                )}
                                title={`${qualificationDisplayLabel(q.kind)}｜${qualificationStatusLabel[status]}${expiryDate ? `｜有効期限 ${expiryDate.toLocaleDateString("ja-JP")}` : ""}`}
                              >
                                <span>{qualificationDisplayLabel(q.kind)}</span>
                              </span>
                              {isExpiringSoon ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                                  !
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground">保有資格</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {heldQualifications.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            協会公式データの連携後にここに表示されます。
                          </p>
                        )}
                        {heldQualifications.map((q) => {
                          const expiryDate = q.expiryDate ? new Date(q.expiryDate) : null;
                          const now = new Date();
                          const isExpired = !!expiryDate && expiryDate.getTime() < now.getTime();
                          const isExpiringSoon =
                            !!expiryDate &&
                            !isExpired &&
                            expiryDate.getTime() - now.getTime() <= 1000 * 60 * 60 * 24 * 30;
                          const status = isExpired ? "EXPIRED" : q.status;

                          return (
                            <div key={q.id} className="relative inline-flex items-center gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm",
                                  qualificationStatusClass[status]
                                )}
                                title={`${qualificationDisplayLabel(q.kind)}｜${qualificationStatusLabel[status]}${expiryDate ? `｜有効期限 ${expiryDate.toLocaleDateString("ja-JP")}` : ""}`}
                              >
                                <span>{qualificationDisplayLabel(q.kind)}</span>
                              </span>
                              {isExpiringSoon ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                                  !
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {user._count.passkeyCredentials === 0 ? (
        <Card padding="none" className="overflow-hidden border-primary/30 bg-primary/[0.06] shadow-sm dark:bg-primary/10">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Shield className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="text-sm font-semibold text-foreground">パスキーでログインを強化</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  端末の顔・指紋やセキュリティキーでログインできます。フィッシング対策と、デバイスに紐づく認証として推奨します。
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
              <Link href="/register/passkey?returnTo=%2Fdashboard">パスキーを登録</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
