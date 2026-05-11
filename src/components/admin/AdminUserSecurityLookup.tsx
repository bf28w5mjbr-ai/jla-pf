"use client";

import { useState } from "react";
import {
  Building2,
  ClipboardList,
  IdCard,
  KeyRound,
  Landmark,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type CandidateRow = {
  id: string;
  familyName: string;
  givenName: string;
  email: string;
  dateOfBirth: string;
};

type ProfilePayload = Record<string, unknown>;

type RelationsPayload = {
  memberships: Array<{
    id: string;
    role: string;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
    club: { id: string; name: string; status: string };
  }>;
  qualifications: Array<Record<string, unknown>>;
  competitionEntries: Array<Record<string, unknown>>;
  passkeys: Array<Record<string, unknown>>;
  orgAdminRoles: Array<Record<string, unknown>>;
  associationAdminRoles: Array<Record<string, unknown>>;
  primaryClub: { id: string; name: string; status: string } | null;
  bankAccount: Record<string, unknown> | null;
};

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP");
}

function sexLabel(sex: string): string {
  if (sex === "MALE") return "男性";
  if (sex === "FEMALE") return "女性";
  return "その他";
}

function DlGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="rounded-xl border border-border/60 bg-muted/15 p-4">
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-all text-sm text-foreground">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminUserSecurityLookup() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [relations, setRelations] = useState<RelationsPayload | null>(null);
  const [audits, setAudits] = useState<LoginAuditRow[]>([]);
  const [passkeyCount, setPasskeyCount] = useState(0);
  const [membershipBusyId, setMembershipBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ membershipId: string; clubName: string } | null>(
    null
  );

  const clearResults = () => {
    setAmbiguous(false);
    setTruncated(false);
    setCandidates([]);
    setProfile(null);
    setRelations(null);
    setAudits([]);
    setPasskeyCount(0);
  };

  const applyDetailPayload = (data: {
    profile: ProfilePayload;
    relations: RelationsPayload;
    loginAudits: LoginAuditRow[];
    passkeyCount: number;
  }) => {
    setAmbiguous(false);
    setTruncated(false);
    setCandidates([]);
    setProfile(data.profile);
    setRelations(data.relations);
    setAudits(data.loginAudits ?? []);
    setPasskeyCount(data.passkeyCount ?? 0);
  };

  const loadByUserId = async (userId: string, options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    setError(null);
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/security-lookup?userId=${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "照会に失敗しました");
        return;
      }
      applyDetailPayload({
        profile: data.profile as ProfilePayload,
        relations: data.relations as RelationsPayload,
        loginAudits: (data.loginAudits as LoginAuditRow[]) ?? [],
        passkeyCount: (data.passkeyCount as number) ?? 0,
      });
    } catch {
      setError("通信に失敗しました");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const mutateMembership = async (
    membershipId: string,
    body: { status?: "APPROVED" | "REJECTED"; role?: "ADMIN" | "MEMBER" }
  ) => {
    const uid = profile?.id;
    if (!uid || typeof uid !== "string") return;
    setMembershipBusyId(membershipId);
    setError(null);
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "更新に失敗しました");
        return;
      }
      await loadByUserId(uid, { quiet: true });
    } catch {
      setError("通信に失敗しました");
    } finally {
      setMembershipBusyId(null);
    }
  };

  const executeDeleteMembership = async () => {
    if (!deleteTarget || !profile?.id || typeof profile.id !== "string") return;
    const { membershipId } = deleteTarget;
    setMembershipBusyId(membershipId);
    setError(null);
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "削除に失敗しました");
        return;
      }
      setDeleteTarget(null);
      await loadByUserId(profile.id, { quiet: true });
    } catch {
      setError("通信に失敗しました");
    } finally {
      setMembershipBusyId(null);
    }
  };

  const runLookup = async () => {
    setError(null);
    clearResults();
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
      if (data.ambiguous === true) {
        setAmbiguous(true);
        setTruncated(Boolean(data.truncated));
        setCandidates((data.candidates as CandidateRow[]) ?? []);
        return;
      }
      applyDetailPayload({
        profile: data.profile as ProfilePayload,
        relations: data.relations as RelationsPayload,
        loginAudits: (data.loginAudits as LoginAuditRow[]) ?? [],
        passkeyCount: (data.passkeyCount as number) ?? 0,
      });
    } catch {
      setError("通信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const accountRows = profile
    ? [
        { label: "ユーザー ID", value: formatCell(profile.id) },
        { label: "メール", value: formatCell(profile.email) },
        { label: "メール検証済み", value: formatCell(profile.emailVerified) },
        { label: "ロール", value: formatCell(profile.role) },
        { label: "主所属クラブ ID", value: formatCell(profile.primaryClubId) },
        { label: "表示言語", value: formatCell(profile.preferredLanguage) },
        { label: "MFA 有効", value: formatCell(profile.mfaEnabled) },
        { label: "MFA 強制", value: formatCell(profile.mfaEnforced) },
        { label: "NFC タグ ID", value: formatCell(profile.nfcTagId) },
        { label: "削除日時", value: formatDateTime(profile.deletedAt as string) },
        { label: "削除予定日時", value: formatDateTime(profile.deletionScheduledAt as string) },
        { label: "アカウント作成", value: formatDateTime(profile.createdAt as string) },
        { label: "最終更新", value: formatDateTime(profile.updatedAt as string) },
      ]
    : [];

  const nameRows = profile
    ? [
        { label: "姓", value: formatCell(profile.familyName) },
        { label: "名", value: formatCell(profile.givenName) },
        { label: "姓（カナ）", value: formatCell(profile.familyNameKana) },
        { label: "名（カナ）", value: formatCell(profile.givenNameKana) },
        { label: "姓（正規化検索用）", value: formatCell(profile.normalizedFamilyName) },
        { label: "名（正規化検索用）", value: formatCell(profile.normalizedGivenName) },
        { label: "生年月日", value: formatDateTime(profile.dateOfBirth as string) },
        { label: "性別", value: sexLabel(String(profile.sex ?? "")) },
        { label: "電話番号（E.164）", value: formatCell(profile.phoneNumber) },
        { label: "電話（マスク）", value: formatCell(profile.phoneMasked) },
        { label: "電話認証済み", value: formatCell(profile.phoneVerified) },
        { label: "電話認証日時", value: formatDateTime(profile.phoneVerifiedAt as string) },
        { label: "プロフィール写真 URL", value: formatCell(profile.profilePhotoUrl) },
      ]
    : [];

  const addressRows = profile
    ? [
        { label: "郵便番号", value: formatCell(profile.postalCode) },
        { label: "都道府県", value: formatCell(profile.prefecture) },
        { label: "市区町村", value: formatCell(profile.city) },
        { label: "町名・番地", value: formatCell(profile.addressLine1) },
        { label: "建物名等", value: formatCell(profile.addressLine2) },
      ]
    : [];

  const emergencyRows = profile
    ? [
        { label: "姓", value: formatCell(profile.emergencyContactFamilyName) },
        { label: "名", value: formatCell(profile.emergencyContactGivenName) },
        { label: "姓（カナ）", value: formatCell(profile.emergencyContactFamilyNameKana) },
        { label: "名（カナ）", value: formatCell(profile.emergencyContactGivenNameKana) },
        { label: "電話", value: formatCell(profile.emergencyContactPhone) },
      ]
    : [];

  const jlaRows = profile
    ? [
        { label: "JLA 会員番号", value: formatCell(profile.jlaMemberNumber) },
        { label: "旧 JLA 会員番号", value: formatCell(profile.legacyJlaMemberNumber) },
      ]
    : [];

  return (
    <div className="space-y-8">
      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">ユーザー検索</CardTitle>
          </div>
          <CardDescription>
            ユーザー ID・メール・氏名またはカナの一部（3文字以上）。複数ヒット時は一覧から選んで詳細を表示します。個人情報の取り扱いに十分注意してください。
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
                placeholder="ユーザーID / メール / 氏名・カナ"
                autoComplete="off"
                className="text-sm sm:font-mono"
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

      {ambiguous && candidates.length > 0 ? (
        <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
          <CardHeader className="border-b border-border/80 bg-muted/25">
            <CardTitle className="text-lg">候補ユーザー</CardTitle>
            <CardDescription>
              複数見つかりました。行をクリックして詳細を表示してください。
              {truncated ? "（最大20件まで表示。検索語を絞り込んでください）" : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>氏名</TableHead>
                  <TableHead>生年月日</TableHead>
                  <TableHead className="min-w-[12rem]">メール</TableHead>
                  <TableHead className="w-[7rem]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => void loadByUserId(c.id)}
                  >
                    <TableCell className="font-medium">
                      {c.familyName} {c.givenName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatDateTime(c.dateOfBirth)}</TableCell>
                    <TableCell className="break-all text-xs">{c.email}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void loadByUserId(c.id);
                        }}
                      >
                        詳細
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {profile && relations ? (
        <>
          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                  <CardTitle className="text-lg">アカウント・識別</CardTitle>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  パスキー {passkeyCount} 件
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-5 sm:p-6">
              <DlGrid rows={accountRows} />
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex items-center gap-2">
                <IdCard className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">氏名・連絡先</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <DlGrid rows={nameRows} />
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg">住所</CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <DlGrid rows={addressRows} />
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg">緊急連絡先</CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <DlGrid rows={emergencyRows} />
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg">JLA</CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <DlGrid rows={jlaRows} />
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">記録上の最終ログイン（User テーブル）</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">日時</dt>
                  <dd className="mt-0.5 font-mono text-foreground">
                    {formatDateTime(profile.lastLoginAt as string)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">IP（生値・運用限定）</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                    {formatCell(profile.lastLoginIp)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">User-Agent</dt>
                  <dd className="mt-0.5 break-all rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-relaxed text-foreground">
                    {truncateUserAgent(String(profile.lastLoginUa ?? ""), 200)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">クラブ所属（最新50件）</CardTitle>
              </div>
              <CardDescription>
                PF 管理者による編集です。削除は未払い会費や最後の管理者であっても強制できます。主所属クラブと一致する行を削除した場合、メイン所属は自動で解除されます。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {relations.memberships.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">なし</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>クラブ</TableHead>
                        <TableHead>ロール</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead>加入日</TableHead>
                        <TableHead className="min-w-[14rem]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relations.memberships.map((m) => {
                        const rowBusy = membershipBusyId === m.id;
                        return (
                          <TableRow key={m.id}>
                            <TableCell>
                              <span className="font-medium">{m.club.name}</span>
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{m.club.id}</span>
                            </TableCell>
                            <TableCell>{m.role}</TableCell>
                            <TableCell>{m.status}</TableCell>
                            <TableCell className="font-mono text-xs whitespace-nowrap">
                              {formatDateTime(m.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex max-w-xl flex-wrap gap-1.5">
                                {m.status === "PENDING" ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={rowBusy}
                                      onClick={() => void mutateMembership(m.id, { status: "APPROVED" })}
                                    >
                                      承認
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={rowBusy}
                                      onClick={() => void mutateMembership(m.id, { status: "REJECTED" })}
                                    >
                                      却下
                                    </Button>
                                  </>
                                ) : null}
                                {m.status === "REJECTED" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={rowBusy}
                                    onClick={() => void mutateMembership(m.id, { status: "APPROVED" })}
                                  >
                                    承認に戻す
                                  </Button>
                                ) : null}
                                {m.status === "APPROVED" ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={rowBusy || m.role === "ADMIN"}
                                      onClick={() => void mutateMembership(m.id, { role: "ADMIN" })}
                                    >
                                      管理者
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={rowBusy || m.role === "MEMBER"}
                                      onClick={() => void mutateMembership(m.id, { role: "MEMBER" })}
                                    >
                                      メンバー
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={rowBusy}
                                      onClick={() => void mutateMembership(m.id, { status: "REJECTED" })}
                                    >
                                      参加拒否
                                    </Button>
                                  </>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={rowBusy}
                                  onClick={() =>
                                    setDeleteTarget({ membershipId: m.id, clubName: m.club.name })
                                  }
                                >
                                  削除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg">資格（最新50件）</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {relations.qualifications.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">なし</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>種別</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>有効期限</TableHead>
                      <TableHead>更新</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relations.qualifications.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className="font-medium">{formatCell(row.kind)}</TableCell>
                        <TableCell>{formatCell(row.status)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatDateTime(row.expiryDate as string)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatDateTime(row.updatedAt as string)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg">大会エントリー（最新50件）</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {relations.competitionEntries.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">なし</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>大会</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>合計料金</TableHead>
                      <TableHead>作成</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relations.competitionEntries.map((row) => {
                      const comp = row.competition as { name?: string } | undefined;
                      return (
                        <TableRow key={String(row.id)}>
                          <TableCell>
                            <span className="font-medium">{comp?.name ?? "—"}</span>
                          </TableCell>
                          <TableCell>{formatCell(row.status)}</TableCell>
                          <TableCell className="font-mono text-xs">{formatCell(row.totalFee)}</TableCell>
                          <TableCell className="font-mono text-xs">{formatDateTime(row.createdAt as string)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg">パスキー（メタデータのみ）</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {relations.passkeys.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">なし</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ラベル</TableHead>
                      <TableHead>カウンター</TableHead>
                      <TableHead>最終利用</TableHead>
                      <TableHead>登録</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relations.passkeys.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell>{formatCell(row.label)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCell(row.counter)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatDateTime(row.lastUsedAt as string)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatDateTime(row.createdAt as string)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">組織・協会の管理ロール</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-5 sm:p-6">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">大会開催団体（Org）</p>
                {relations.orgAdminRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">なし</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {relations.orgAdminRoles.map((row) => {
                      const org = row.organization as { name?: string } | undefined;
                      return (
                        <li key={String(row.id)} className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                          <span className="font-medium">{org?.name ?? "—"}</span>
                          <span className="ml-2 text-muted-foreground">{formatCell(row.role)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">協会（Association）</p>
                {relations.associationAdminRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">なし</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {relations.associationAdminRoles.map((row) => {
                      const asc = row.association as { name?: string } | undefined;
                      return (
                        <li key={String(row.id)} className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                          <span className="font-medium">{asc?.name ?? "—"}</span>
                          <span className="ml-2 text-muted-foreground">{formatCell(row.role)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">主所属クラブ（User.primaryClub）</p>
                {relations.primaryClub ? (
                  <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
                    <span className="font-medium">{relations.primaryClub.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{relations.primaryClub.id}</span>
                    <Badge variant="outline" className="ml-2">
                      {relations.primaryClub.status}
                    </Badge>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">なし</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/25">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                <CardTitle className="text-lg">振込口座（番号はマスク）</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {!relations.bankAccount ? (
                <p className="text-sm text-muted-foreground">なし</p>
              ) : (
                <DlGrid
                  rows={[
                    { label: "銀行名", value: formatCell(relations.bankAccount.bankName) },
                    { label: "支店名", value: formatCell(relations.bankAccount.branchName) },
                    { label: "口座種別", value: formatCell(relations.bankAccount.accountType) },
                    { label: "口座番号", value: formatCell(relations.bankAccount.accountNumberMasked) },
                    { label: "口座名義", value: formatCell(relations.bankAccount.accountHolderName) },
                  ]}
                />
              )}
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
                        <p className="mt-1 font-mono text-xs text-foreground">IP: {m.ipMasked ?? "—"}</p>
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>メンバーシップを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  「{deleteTarget.clubName}」への所属を削除します。PF
                  管理者による強制削除のため、未払い会費や最後の管理者であっても実行されます。
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={membershipBusyId !== null}
              onClick={() => void executeDeleteMembership()}
            >
              削除する
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
