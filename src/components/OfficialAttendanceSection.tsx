"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Nfc, PlayCircle, StopCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNfcScanSupportedSync, startNfcScanSession } from "@/lib/nfc/nfcScanSession";

type AttendanceMember = {
  userId: string;
  name: string;
  positionName: string;
  hasNfcTag: boolean;
  attended: boolean;
  method: "MANUAL" | "NFC" | null;
};

type AttendancePayload = {
  competitionName: string;
  dateTabs: string[];
  selectedDate: string;
  members: AttendanceMember[];
  summary: {
    approvedCount: number;
    attendedCount: number;
  };
};

export default function OfficialAttendanceSection({
  organizationId,
  competitionId,
  canEdit,
  compact = false,
}: {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  compact?: boolean;
}) {
  const [activeDate, setActiveDate] = useState<string>("");
  const [confirmMode, setConfirmMode] = useState(false);
  const [payload, setPayload] = useState<AttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [nfcPending, setNfcPending] = useState(false);
  const [manualTag, setManualTag] = useState("");
  const [nfcListening, setNfcListening] = useState(false);
  const nfcAbortRef = useRef<AbortController | null>(null);

  const nfcAutoReadSupported = useMemo(() => isNfcScanSupportedSync(), []);

  const load = async (date?: string) => {
    setLoading(true);
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/official-attendances${qs}`,
        { cache: "no-store" }
      );
      const body = (await res.json().catch(() => ({}))) as AttendancePayload & { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "出席情報の取得に失敗しました");
      }
      setPayload(body);
      setActiveDate(body.selectedDate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "出席情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, competitionId]);

  useEffect(() => {
    if (!confirmMode || !nfcAutoReadSupported) {
      nfcAbortRef.current?.abort();
      nfcAbortRef.current = null;
      setNfcListening(false);
      return;
    }
    return () => {
      nfcAbortRef.current?.abort();
      nfcAbortRef.current = null;
      setNfcListening(false);
    };
  }, [confirmMode, nfcAutoReadSupported]);

  const toggleAttendance = async (userId: string, checked: boolean) => {
    if (!activeDate) return;
    setSavingUserId(userId);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/official-attendances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "manual",
            date: activeDate,
            userId,
            attended: checked,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "出席更新に失敗しました");
      await load(activeDate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "出席更新に失敗しました");
    } finally {
      setSavingUserId(null);
    }
  };

  const postNfc = async (tag: string) => {
    if (!activeDate || !tag.trim()) return;
    setNfcPending(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/official-attendances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "nfc",
            date: activeDate,
            nfcTagId: tag.trim(),
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        scannedUser?: { name: string };
      };
      if (!res.ok) throw new Error(body.error || "NFC出席登録に失敗しました");
      toast.success(`${body.scannedUser?.name ?? "対象者"}を出席登録しました`);
      setManualTag("");
      await load(activeDate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "NFC出席登録に失敗しました");
    } finally {
      setNfcPending(false);
    }
  };

  const startNfcListening = async () => {
    if (!nfcAutoReadSupported) {
      toast.error("この環境ではNFCの自動読取に対応していません");
      return;
    }
    nfcAbortRef.current?.abort();
    const ac = new AbortController();
    nfcAbortRef.current = ac;
    try {
      await startNfcScanSession(
        {
          signal: ac.signal,
          iosSessionType: "tag",
          invalidateAfterFirstRead: false,
          alertMessage: "NFCタグをかざして出席登録",
        },
        (serial) => {
          void postNfc(serial);
        }
      );
      if (!ac.signal.aborted) {
        setNfcListening(true);
      }
    } catch (error) {
      setNfcListening(false);
      if (error instanceof Error && error.message.includes("対応していません")) {
        toast.error("この環境ではNFCの自動読取に対応していません");
        return;
      }
      toast.error("NFC読取を開始できませんでした");
    }
  };

  const stopNfcListening = () => {
    nfcAbortRef.current?.abort();
    nfcAbortRef.current = null;
    setNfcListening(false);
  };

  return (
    <Card className="overflow-hidden border-border/80">
      {!compact ? (
        <CardHeader className="border-b border-border/60 bg-muted/15 py-3">
          <CardTitle className="text-base">当日出席確認</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            開催日ごとに承認済みオフィシャル（一般/TO含む）の出席を確認します。チェックボックスまたはNFCで出席登録できます。出席記録は人数集計・CSV 等に利用され、当日運用の操作権限とは連動しません。
          </CardDescription>
        </CardHeader>
      ) : null}
      <CardContent className={compact ? "space-y-3 p-3" : "space-y-4 pt-5"}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={confirmMode ? "secondary" : "default"}
            onClick={() => setConfirmMode((v) => !v)}
            disabled={!canEdit}
            className="gap-1.5"
          >
            {confirmMode ? <StopCircle className="h-4 w-4" aria-hidden /> : <PlayCircle className="h-4 w-4" aria-hidden />}
            {confirmMode ? "出欠確認を終了" : "出欠確認を開始"}
          </Button>
          {payload ? (
            <p className="text-xs text-muted-foreground">
              承認済み {payload.summary.approvedCount}名 / 出席 {payload.summary.attendedCount}名
            </p>
          ) : null}
        </div>

        {loading ? <p className="text-sm text-muted-foreground">出席情報を読み込み中…</p> : null}

        {!loading && payload ? (
          <div className="space-y-4">
            <Tabs value={activeDate} onValueChange={(value) => void load(value)} className="w-full">
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-border/70 bg-muted/30 p-1">
                {payload.dateTabs.map((date) => (
                  <TabsTrigger
                    key={date}
                    value={date}
                    className="min-w-[7.5rem] rounded-md px-2 py-1.5 text-xs data-[state=active]:bg-background"
                  >
                    {new Date(`${date}T00:00:00.000Z`).toLocaleDateString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {confirmMode ? (
              <div className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">NFC出席登録</p>
                  <Button
                    type="button"
                    size="sm"
                    variant={nfcListening ? "secondary" : "outline"}
                    className="gap-1.5"
                    onClick={nfcListening ? stopNfcListening : () => void startNfcListening()}
                  >
                    <Nfc className="h-4 w-4" aria-hidden />
                    {nfcListening ? "NFC待受中（停止）" : "NFC待受開始"}
                  </Button>
                </div>
                {!nfcAutoReadSupported ? (
                  <p className="text-xs text-muted-foreground">
                    この環境では端末のNFC自動読取が使えません。下の手入力でNFCタグIDを登録してください。
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="official-attendance-tag" className="text-xs text-muted-foreground">
                      NFCタグID（手入力）
                    </Label>
                    <Input
                      id="official-attendance-tag"
                      value={manualTag}
                      onChange={(e) => setManualTag(e.target.value)}
                      placeholder="04A224..."
                      className="h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={nfcPending || !manualTag.trim()}
                    onClick={() => void postNfc(manualTag)}
                  >
                    NFCで登録
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              {payload.members.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                  承認済みオフィシャルがいません。
                </p>
              ) : (
                payload.members.map((member) => (
                  <label
                    key={member.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.positionName}
                        {member.hasNfcTag ? " · NFC登録あり" : " · NFC未登録"}
                        {member.attended && member.method ? ` · ${member.method}` : ""}
                      </p>
                    </div>
                    {confirmMode ? (
                      <Checkbox
                        checked={member.attended}
                        disabled={savingUserId === member.userId}
                        onCheckedChange={(checked) =>
                          void toggleAttendance(member.userId, checked === true)
                        }
                        aria-label={`${member.name}の出席`}
                      />
                    ) : member.attended ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        出席
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">未出席</span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
