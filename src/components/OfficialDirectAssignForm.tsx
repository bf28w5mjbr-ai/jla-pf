"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { OfficialPositionRow } from "@/lib/officialPositions";

type AttendancePayload = {
  members: Array<{
    userId: string;
    name: string;
    attended: boolean;
  }>;
};

type Props = {
  organizationId: string;
  competitionId: string;
  competitionStartDate: Date;
  competitionEndDate: Date;
  positions: OfficialPositionRow[];
};

export default function OfficialDirectAssignForm({
  organizationId,
  competitionId,
  competitionStartDate,
  competitionEndDate,
  positions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [attendanceDate, setAttendanceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [userId, setUserId] = useState("");
  const [positionName, setPositionName] = useState(positions[0]?.positionName ?? "");
  const [members, setMembers] = useState<Array<{ userId: string; name: string }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const minDate = useMemo(
    () => competitionStartDate.toISOString().slice(0, 10),
    [competitionStartDate]
  );
  const maxDate = useMemo(
    () => competitionEndDate.toISOString().slice(0, 10),
    [competitionEndDate]
  );

  useEffect(() => {
    if (attendanceDate < minDate) {
      setAttendanceDate(minDate);
      return;
    }
    if (attendanceDate > maxDate) {
      setAttendanceDate(maxDate);
    }
  }, [attendanceDate, maxDate, minDate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingMembers(true);
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/official-attendances?date=${encodeURIComponent(
            attendanceDate
          )}`,
          { cache: "no-store" }
        );
        const body = (await res.json().catch(() => ({}))) as AttendancePayload & { error?: string };
        if (!res.ok) {
          throw new Error(body.error || "出席済みメンバーの取得に失敗しました");
        }
        if (cancelled) return;
        const attendedMembers = body.members
          .filter((m) => m.attended)
          .map((m) => ({ userId: m.userId, name: m.name }));
        setMembers(attendedMembers);
        setUserId((prev) =>
          prev && attendedMembers.some((member) => member.userId === prev)
            ? prev
            : attendedMembers[0]?.userId ?? ""
        );
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "出席済みメンバーの取得に失敗しました");
          setMembers([]);
          setUserId("");
        }
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [attendanceDate, competitionId, organizationId]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !positionName || !attendanceDate) {
      toast.error("対象日・出席済みメンバー・ポジションを選択してください");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/official-assignments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, positionName, attendanceDate }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "割当に失敗しました");
          return;
        }
        toast.success("オフィシャルを割り当てました");
        router.refresh();
      } catch {
        toast.error("割当に失敗しました");
      }
    });
  };

  if (positions.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium text-foreground">主催による直接割当</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        対象日の出席確認済みメンバーから選んで割り当てます。割当後は承認済みオフィシャルとして登録され、スタートリスト関連の操作権限が付与されます。
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor="official-assign-date" className="text-xs">
            対象日
          </Label>
          <input
            id="official-assign-date"
            type="date"
            value={attendanceDate}
            min={minDate}
            max={maxDate}
            onChange={(ev) => setAttendanceDate(ev.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            disabled={pending}
          />
        </div>
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor="official-assign-user" className="text-xs">
            出席済みメンバー
          </Label>
          <select
            id="official-assign-user"
            value={userId}
            onChange={(ev) => setUserId(ev.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            disabled={pending || loadingMembers || members.length === 0}
          >
            {members.length === 0 ? (
              <option value="">
                {loadingMembers ? "読み込み中…" : "出席済みメンバーなし"}
              </option>
            ) : null}
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor="official-assign-position" className="text-xs">
            ポジション
          </Label>
          <select
            id="official-assign-position"
            value={positionName}
            onChange={(ev) => setPositionName(ev.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            disabled={pending}
          >
            {positions.map((p) => (
              <option key={p.positionName} value={p.positionName}>
                {p.positionName}（募集 {p.count}）
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-9 w-full sm:w-auto"
          disabled={pending || loadingMembers || !userId}
        >
          {pending ? "処理中…" : "割当する"}
        </Button>
      </div>
    </form>
  );
}
