"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";

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

function deriveInitialEntryType(
  app: InitialApplication,
  technicalOfficialEnabled: boolean
): "GENERAL" | "TECHNICAL" {
  const pn = app?.positionName;
  if (pn && pn.startsWith("テクニカルオフィシャル（")) return "TECHNICAL";
  if (!technicalOfficialEnabled) return "GENERAL";
  return "GENERAL";
}

function deriveInitialClubId(
  app: InitialApplication,
  technicalClubs: Array<{ clubId: string; clubName: string }>
): string {
  const pn = app?.positionName;
  if (!pn || !pn.startsWith("テクニカルオフィシャル（")) {
    return technicalClubs[0]?.clubId ?? "";
  }
  const m = pn.match(/^テクニカルオフィシャル（([^）]+)）$/);
  const clubName = m?.[1]?.trim();
  if (!clubName) return technicalClubs[0]?.clubId ?? "";
  return technicalClubs.find((c) => c.clubName === clubName)?.clubId ?? technicalClubs[0]?.clubId ?? "";
}

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
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawPending, setWithdrawPending] = useState(false);

  const hasApplication = Boolean(initialApplication);
  const isApprovedOrPending =
    hasApplication &&
    (initialApplication!.status === "APPROVED" || initialApplication!.status === "PENDING");
  const canEditExisting = Boolean(isApprovedOrPending && canSubmit);
  const showReadOnlyAfterSubmit = Boolean(isApprovedOrPending && !canSubmit);
  const usePatch = canEditExisting;
  const isExistingTechnicalApplication = Boolean(
    initialApplication?.positionName?.startsWith("テクニカルオフィシャル（")
  );
  const blockTechnicalUpdateWhileDisabled =
    usePatch && isExistingTechnicalApplication && !technicalOfficialEnabled;

  const [message, setMessage] = useState(initialApplication?.message ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [entryType, setEntryType] = useState<"GENERAL" | "TECHNICAL">(() =>
    deriveInitialEntryType(initialApplication, technicalOfficialEnabled)
  );
  const [selectedClubId, setSelectedClubId] = useState(() =>
    deriveInitialClubId(initialApplication, technicalClubs)
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blockTechnicalUpdateWhileDisabled) {
      toast.error("TO募集が停止中のため応募内容を変更できません。取り消す場合は下のボタンを利用してください。");
      return;
    }
    if (entryType === "TECHNICAL" && !selectedClubId) {
      toast.error("TO応募ではクラブ選択が必要です");
      return;
    }
    startTransition(async () => {
      try {
        const method = usePatch ? "PATCH" : "POST";
        const res = await fetch(`/api/competitions/${competitionId}/official-applications`, {
          method,
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
        toast.success(usePatch ? "応募内容を更新しました" : "応募を受け付けました");
        setConfirmed(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "送信に失敗しました");
      }
    });
  };

  const withdraw = async () => {
    if (withdrawPending) return;
    setWithdrawPending(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/official-applications`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "取り消しに失敗しました");
      }
      toast.success("オフィシャル応募を取り消しました");
      setWithdrawOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "取り消しに失敗しました");
    } finally {
      setWithdrawPending(false);
    }
  };

  if (showReadOnlyAfterSubmit) {
    const isLegacyPending = initialApplication?.status === "PENDING";
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck
              className={`h-5 w-5 ${isLegacyPending ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
              aria-hidden
            />
            <CardTitle className="text-lg">
              {isLegacyPending ? "オフィシャル応募" : "オフィシャル応募（受付済み）"}
            </CardTitle>
          </div>
          <CardDescription>
            {isLegacyPending
              ? "応募は登録済みです。"
              : "この大会のオフィシャルとして受付済みです。"}
            {initialApplication?.positionName ? `（${initialApplication.positionName}）` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              isLegacyPending
                ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
            }`}
          >
            {submitBlockedReason ??
              "競技者エントリー受付期間外のため、応募内容の変更はできません。"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {usePatch ? (
            <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : null}
          <CardTitle className="text-lg">
            {usePatch ? "オフィシャル応募（受付済み）" : "オフィシャル参加エントリー"}
          </CardTitle>
        </div>
        <CardDescription className={cn(!usePatch && pageIntroTextClass("guided"), "mt-1.5")}>
          {usePatch ? (
            <>
              応募は受付済みです。
              {initialApplication?.positionName ? (
                <span className="mt-1 block text-foreground/90">
                  現在の内容: {initialApplication.positionName}
                </span>
              ) : null}
              <span className="mt-2 block text-muted-foreground">
                競技者エントリー受付期間内であれば、一般／TO の切替やメッセージの修正ができます。
              </span>
            </>
          ) : (
            <>この大会でオフィシャルを担当する意思を登録します。エントリー料は発生しません。</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usePatch ? (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {
              "受付期間内であれば、応募内容を更新できます。応募そのものを取り消すこともできます（取り消し後は未応募扱いで再応募できます。TOとして応募している場合は、応募から付いたクラブ任命も解除されます）。"
            }
          </p>
        ) : null}
        <AutofillSyncForm onSubmit={submit} className="space-y-4">
          {!usePatch && initialApplication?.status === "REJECTED" ? (
            <p className={pageIntroTextClass("balanced")}>
              前回の応募は見送りとなりました。内容を更新して再エントリーできます。
            </p>
          ) : null}
          <div className="rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {usePatch ? "変更後の応募内容を選択してください。" : "エントリー内容を選択してください。"}
          </div>
          {blockTechnicalUpdateWhileDisabled ? (
            <p className="rounded-md border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              この大会では現在TO募集が停止中のため、既存のTO応募内容は変更できません。応募をやめる場合は「応募を取り消す」を利用してください。
            </p>
          ) : null}
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
              {technicalOfficialEnabled || isExistingTechnicalApplication ? (
                <Label
                  htmlFor="official-type-technical"
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background px-3 py-2"
                >
                  <RadioGroupItem id="official-type-technical" value="TECHNICAL" />
                  <span className="text-xs leading-relaxed">
                    <span className="block font-medium text-foreground">TOとして応募</span>
                    <span className="text-muted-foreground">
                      クラブのテクニカルオフィシャルとして応募。保存すると選択したクラブの任命として登録され、不足人数のカウントに含まれます。
                    </span>
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
              {usePatch
                ? "変更後の内容でオフィシャル応募を続けることに同意します。"
                : "上記内容を確認し、この大会でオフィシャルを担当する意思があることに同意します。"}
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
              blockTechnicalUpdateWhileDisabled ||
              (entryType === "TECHNICAL" && (!selectedClubId || technicalClubs.length === 0))
            }
            className="w-full sm:w-auto"
          >
            {isPending ? "送信中…" : usePatch ? "応募内容を更新" : "応募する"}
          </Button>
        </AutofillSyncForm>

        {usePatch && canSubmit ? (
          <>
            <div className="mt-6 border-t border-border/80 pt-5">
              <p className="mb-2 text-xs text-muted-foreground">応募の取り消し</p>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isPending || withdrawPending}
                onClick={() => setWithdrawOpen(true)}
              >
                応募を取り消す
              </Button>
            </div>
            <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>オフィシャル応募を取り消しますか？</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2 text-left">
                    <span className="block">
                      取り消すとこの大会へのオフィシャル応募はなくなり、必要なら再度「応募する」から登録できます。
                    </span>
                    <span className="block">
                      TOとして応募している場合、当該大会でのクラブ任命（応募から付いたもの）も解除されます。招待で付いた任命はそのままです。
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={withdrawPending}>キャンセル</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={withdrawPending}
                    onClick={() => void withdraw()}
                  >
                    {withdrawPending ? "取り消し中…" : "取り消す"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
