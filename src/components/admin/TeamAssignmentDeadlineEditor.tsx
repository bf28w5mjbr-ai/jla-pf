"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  buildStartListSettingsPayload,
  parseStartListSettings,
} from "@/lib/startListSettings";

type Props = {
  competitionId: string;
  initialSettings?: unknown;
};

export default function TeamAssignmentDeadlineEditor({
  competitionId,
  initialSettings,
}: Props) {
  const parsedInitial = parseStartListSettings(initialSettings);
  const [teamAssignmentDeadline, setTeamAssignmentDeadline] = useState(
    parsedInitial.teamAssignmentDeadline
      ? new Date(parsedInitial.teamAssignmentDeadline).toISOString().slice(0, 16)
      : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/start-list-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startListSettings: buildStartListSettingsPayload({
            eventSettings: parsedInitial.eventSettings,
            teamAssignmentDeadline: teamAssignmentDeadline || null,
          }),
        }),
      });

      if (!response.ok) {
        throw new Error("目安日時の保存に失敗しました");
      }

      setSavedAt(new Date());
    } catch (error) {
      console.error("Team assignment deadline save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/80 bg-muted/20 p-4">
        <div className="space-y-2">
          <Label htmlFor="teamAssignmentDeadline">チームメンバー割当の目安日時（通知用）</Label>
          <Input
            id="teamAssignmentDeadline"
            type="datetime-local"
            value={teamAssignmentDeadline}
            onChange={(e) => setTeamAssignmentDeadline(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            編集の確定は、各チームがスタートリスト上で乗るヒートのマーシャル締切までです。ここに保存する日時は通知や運用の目安用であり、編集可否の上限には使いません。
          </p>
        </div>
      </div>

      <div className="rounded-md border border-dashed border-border/80 bg-muted/10 p-4">
        <p className="text-sm font-medium text-foreground">スタートリスト（ヒート・レーン・タイムスケジュール）</p>
        <p className="mt-1 text-xs text-muted-foreground">
          ラウンド数・ヒート分割・開始時刻の設定は大会公開ページの「スタートリスト」タブから行います。
        </p>
        <Button variant="outline" size="sm" className="mt-3 h-8 gap-1 text-xs" asChild>
          <Link href={`/competitions/${competitionId}?tab=start-list`}>
            スタートリスト設定へ
            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {savedAt
            ? `保存済み ${savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
            : "未保存"}
        </div>
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "保存中…" : "目安日時を保存"}
        </Button>
      </div>
    </div>
  );
}
