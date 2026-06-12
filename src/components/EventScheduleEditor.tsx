"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS,
  datetimeLocalInputValueToUtcIsoString,
  formatDateForDatetimeLocalInput,
  parseCompetitionScheduleDatetimeInput,
} from "@/lib/datetimeLocal";
import {
  competitionScheduleDatetimeLocalMinMax,
  isInstantWithinCompetitionEventSchedule,
} from "@/lib/eventScheduleWithinCompetition";

type Props = {
  competitionId: string;
  eventId: string;
  competitionStartDate: Date | string;
  competitionEndDate: Date | string;
  initialStart: Date | null;
  initialEnd: Date | null;
  canEdit: boolean;
};

export default function EventScheduleEditor({
  competitionId,
  eventId,
  competitionStartDate,
  competitionEndDate,
  initialStart,
  initialEnd,
  canEdit,
}: Props) {
  const router = useRouter();
  const compStart = useMemo(() => new Date(competitionStartDate), [competitionStartDate]);
  const compEnd = useMemo(() => new Date(competitionEndDate), [competitionEndDate]);
  const scheduleMinMax = useMemo(
    () => competitionScheduleDatetimeLocalMinMax(compStart, compEnd),
    [compStart, compEnd]
  );
  const [start, setStart] = useState(
    initialStart
      ? formatDateForDatetimeLocalInput(new Date(initialStart), COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS)
      : ""
  );
  const [end, setEnd] = useState(
    initialEnd
      ? formatDateForDatetimeLocalInput(new Date(initialEnd), COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS)
      : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStart(
      initialStart
        ? formatDateForDatetimeLocalInput(new Date(initialStart), COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS)
        : ""
    );
    setEnd(
      initialEnd
        ? formatDateForDatetimeLocalInput(new Date(initialEnd), COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS)
        : ""
    );
  }, [initialStart, initialEnd]);

  if (!canEdit) {
    return null;
  }

  const handleSave = async () => {
    let startParsed: Date | null = null;
    let endParsed: Date | null = null;
    try {
      startParsed = start.trim() === "" ? null : parseCompetitionScheduleDatetimeInput(start);
      endParsed = end.trim() === "" ? null : parseCompetitionScheduleDatetimeInput(end);
    } catch {
      toast.error("日時の形式が不正です");
      return;
    }
    if (startParsed && !isInstantWithinCompetitionEventSchedule(startParsed, compStart, compEnd)) {
      toast.error("開始日時は大会の開催期間内にしてください");
      return;
    }
    if (endParsed && !isInstantWithinCompetitionEventSchedule(endParsed, compStart, compEnd)) {
      toast.error("終了日時は大会の開催期間内にしてください");
      return;
    }
    if (startParsed && endParsed && endParsed < startParsed) {
      toast.error("終了日時は開始日時以降にしてください");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledStartAt:
            start.trim() === ""
              ? null
              : datetimeLocalInputValueToUtcIsoString(
                  start.trim(),
                  COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS
                ),
          scheduledEndAt:
            end.trim() === ""
              ? null
              : datetimeLocalInputValueToUtcIsoString(
                  end.trim(),
                  COMPETITION_SCHEDULE_DATETIME_LOCAL_OPTS
                ),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || "保存に失敗しました");
      }
      toast.success(data.message || "日程を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/80 py-0 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/20 px-3 py-2">
        <CardTitle className="text-sm font-semibold">種目の日程</CardTitle>
        <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 px-3 py-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`ev-sched-start-${eventId}`} className="text-xs">
            開始
          </Label>
          <Input
            id={`ev-sched-start-${eventId}`}
            type="datetime-local"
            min={scheduleMinMax.min}
            max={scheduleMinMax.max}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-sched-end-${eventId}`} className="text-xs">
            終了（任意）
          </Label>
          <Input
            id={`ev-sched-end-${eventId}`}
            type="datetime-local"
            min={scheduleMinMax.min}
            max={scheduleMinMax.max}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <p className="text-[10px] text-muted-foreground sm:col-span-2">
          未入力の項目はクリアされます。日時は大会の開催日の範囲内にしてください。
        </p>
      </CardContent>
    </Card>
  );
}
