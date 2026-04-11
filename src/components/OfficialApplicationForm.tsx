"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCheck } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pageIntroTextClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";

type InitialApplication = {
  status: "PENDING" | "APPROVED" | "REJECTED";
  positionName?: string;
  message: string | null;
} | null;

type Props = {
  competitionId: string;
  initialApplication: InitialApplication;
  canSubmit: boolean;
  submitBlockedReason?: string | null;
  showAdminOverrideHint?: boolean;
  technicalOfficialEnabled: boolean;
  technicalClubs: Array<{ clubId: string; clubName: string }>;
};

export function OfficialApplicationForm({
  competitionId,
  initialApplication,
  canSubmit,
  submitBlockedReason = null,
  showAdminOverrideHint = false,
  technicalOfficialEnabled,
  technicalClubs,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(initialApplication?.message ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [entryType, setEntryType] = useState<"GENERAL" | "TECHNICAL">(
    technicalOfficialEnabled ? "GENERAL" : "GENERAL"
  );
  const [selectedClubId, setSelectedClubId] = useState<string>(technicalClubs[0]?.clubId ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entryType === "TECHNICAL" && !selectedClubId) {
      toast.error("TO応募ではクラブ選択が必要です");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/official-applications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message.trim() || undefined,
            entryType,
            clubId: entryType === "TECHNICAL" ? selectedClubId : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "送信に失敗しました");
        }
        toast.success("応募を受け付けました");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "送信に失敗しました");
      }
    });
  };

  if (initialApplication?.status === "PENDING") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            <CardTitle className="text-lg">オフィシャル応募</CardTitle>
          </div>
          <CardDescription>
            応募は受理済みです。現在、主催者が確認中です。
            {initialApplication?.positionName ? `（${initialApplication.positionName}）` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            応募は受理済みです。主催者の確認（審査中）です。結果が出るまでお待ちください。
          </p>
        </CardContent>
      </Card>
    );
  }

  if (initialApplication?.status === "APPROVED") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <CardTitle className="text-lg">オフィシャル応募</CardTitle>
          </div>
          <CardDescription>
            この大会のオフィシャルとして承認されています。
            {initialApplication?.positionName ? `（${initialApplication.positionName}）` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            この大会のオフィシャルとして承認されています。主催者からの連絡をお待ちください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">オフィシャル参加エントリー</CardTitle>
        <CardDescription className={cn(pageIntroTextClass("guided"), "mt-1.5")}>
          この大会でオフィシャルを担当する意思を登録します。エントリー料は発生しません。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {initialApplication?.status === "REJECTED" ? (
            <p className={pageIntroTextClass("balanced")}>
              前回の応募は見送りとなりました。内容を更新して再エントリーできます。
            </p>
          ) : null}
          <div className="rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            エントリー内容を選択してください。
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">応募種別</Label>
            <RadioGroup
              value={entryType}
              onValueChange={(v) => setEntryType(v === "TECHNICAL" ? "TECHNICAL" : "GENERAL")}
              className="grid gap-2 sm:grid-cols-2"
            >
              <Label
                htmlFor="official-type-general"
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background px-3 py-2"
              >
                <RadioGroupItem id="official-type-general" value="GENERAL" />
                <span className="text-xs leading-relaxed">
                  <span className="block font-medium text-foreground">一般オフィシャルとして応募</span>
                  <span className="text-muted-foreground">通常のオフィシャル参加</span>
                </span>
              </Label>
              {technicalOfficialEnabled ? (
                <Label
                  htmlFor="official-type-technical"
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background px-3 py-2"
                >
                  <RadioGroupItem id="official-type-technical" value="TECHNICAL" />
                  <span className="text-xs leading-relaxed">
                    <span className="block font-medium text-foreground">TOとして応募</span>
                    <span className="text-muted-foreground">クラブのテクニカルオフィシャルとして応募</span>
                  </span>
                </Label>
              ) : null}
            </RadioGroup>
          </div>
          {entryType === "TECHNICAL" ? (
            <div className="space-y-2">
              <Label htmlFor="technical-club">TO応募対象のクラブ</Label>
              <Select
                value={selectedClubId}
                onValueChange={setSelectedClubId}
                disabled={isPending || technicalClubs.length === 0}
              >
                <SelectTrigger id="technical-club" className="w-full sm:max-w-lg">
                  <SelectValue placeholder="クラブを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {technicalClubs.map((m) => (
                    <SelectItem key={m.clubId} value={m.clubId}>
                      {m.clubName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {technicalClubs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  この大会で参加が確定しているクラブがないため、TO応募は選択できません。
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="official-message">メッセージ（任意）</Label>
            <Textarea
              id="official-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="経験・希望など"
              rows={3}
              maxLength={2000}
              disabled={isPending}
              className="resize-y"
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {message.length} / 2000
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border/80 bg-muted/20 px-3 py-2">
            <Checkbox
              id="official-consent"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              disabled={isPending || !canSubmit}
            />
            <Label htmlFor="official-consent" className="cursor-pointer text-xs leading-relaxed">
              上記内容を確認し、この大会でオフィシャルを担当する意思があることに同意します。
            </Label>
          </div>
          {!canSubmit ? (
            <p className="rounded-md border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              {submitBlockedReason ?? "現在は応募を受け付けていません。"}
            </p>
          ) : null}
          {showAdminOverrideHint ? (
            <p className="text-[11px] text-muted-foreground">
              主催者権限のため、期間外でも送信できます。
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              isPending ||
              !confirmed ||
              !canSubmit ||
              (entryType === "TECHNICAL" && (!selectedClubId || technicalClubs.length === 0))
            }
            className="w-full sm:w-auto"
          >
            {isPending ? "送信中…" : "応募する"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
