"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Lock,
  Save,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Sex } from "@prisma/client";
import {
  isClubMemberEligibleForTeamAssignmentSlot,
  type TeamAssignmentCompetitionJson,
  type TeamAssignmentEventJson,
} from "@/lib/teamMemberSlotEligibility";

const EMPTY_SLOT_VALUE = "__none__";

type ClubOption = {
  id: string;
  name: string;
};

type EligibleMember = {
  userId: string;
  name: string;
  sex: Sex;
  dateOfBirth: string | null;
};

type TeamEntryAssignment = {
  teamEntryId: string;
  eventId: string;
  eventName: string;
  sexLabel: string;
  teamName: string;
  /** 互換・表示用（スロット順の一覧） */
  memberUserIds: string[];
  relayPositionCount: number | null;
  relayPositionLabels: string[];
  memberSlots: (string | null)[];
};

type Props = {
  competitionId: string;
  clubs: ClubOption[];
  assignmentsByClub: Record<string, TeamEntryAssignment[]>;
  eligibleMembersByClub: Record<string, EligibleMember[]>;
  isAssignmentWindowOpen: boolean;
  assignmentDeadlineLabel: string;
  /** チームがスタートリスト上で乗るヒートのマーシャル締切済みなら true（編集不可） */
  marshalBlockByTeamEntryId?: Record<string, boolean>;
  /** URL の `?clubId=` と同期（クラブ詳細からの導線用） */
  initialClubId?: string | null;
  /** 種目ごとの性別・年齢候補絞り込み（未指定なら従来どおり全員を表示） */
  teamAssignmentCompetition?: TeamAssignmentCompetitionJson | null;
  teamAssignmentEventsById?: Record<string, TeamAssignmentEventJson> | null;
};

function slotLabel(assignment: TeamEntryAssignment, index: number): string {
  const named = assignment.relayPositionLabels[index]?.trim();
  if (named) return named;
  return `第${index + 1}ポジション`;
}

function countFilledSlots(assignments: TeamEntryAssignment[]): number {
  return assignments.reduce(
    (acc, a) => acc + a.memberSlots.filter((uid) => Boolean(uid)).length,
    0
  );
}

function countTotalSlots(assignments: TeamEntryAssignment[]): number {
  return assignments.reduce((acc, a) => acc + a.memberSlots.length, 0);
}

function memberOptionDisabledReason(params: {
  member: EligibleMember;
  selectedUserId: string | null;
  takenElsewhere: Set<string>;
  eventJson: TeamAssignmentEventJson | undefined;
  competitionJson: TeamAssignmentCompetitionJson | undefined;
}): string | null {
  const { member, selectedUserId, takenElsewhere, eventJson, competitionJson } = params;
  if (takenElsewhere.has(member.userId) && member.userId !== selectedUserId) {
    return "他ポジションに配属済み";
  }
  if (!eventJson || !competitionJson) return null;
  if (member.userId === selectedUserId) return null;
  const ok = isClubMemberEligibleForTeamAssignmentSlot({
    memberSex: member.sex,
    memberDateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
    event: eventJson,
    competition: competitionJson,
  });
  return ok ? null : "種目の条件外";
}

export default function CompetitionTeamAssignmentManager({
  competitionId,
  clubs,
  assignmentsByClub,
  eligibleMembersByClub,
  isAssignmentWindowOpen,
  assignmentDeadlineLabel,
  marshalBlockByTeamEntryId = {},
  initialClubId,
  teamAssignmentCompetition = null,
  teamAssignmentEventsById = null,
}: Props) {
  const router = useRouter();
  const [selectedClubId, setSelectedClubId] = useState(() => {
    if (initialClubId && clubs.some((c) => c.id === initialClubId)) {
      return initialClubId;
    }
    return clubs[0]?.id ?? "";
  });
  const [draftAssignments, setDraftAssignments] =
    useState<Record<string, TeamEntryAssignment[]>>(assignmentsByClub);
  const [isSaving, setIsSaving] = useState(false);

  const currentAssignments = useMemo(
    () => draftAssignments[selectedClubId] ?? [],
    [draftAssignments, selectedClubId]
  );
  const eligibleMembers = useMemo(
    () => eligibleMembersByClub[selectedClubId] ?? [],
    [eligibleMembersByClub, selectedClubId]
  );
  const selectedClubLabel = useMemo(
    () => clubs.find((c) => c.id === selectedClubId)?.name ?? "",
    [clubs, selectedClubId]
  );

  const hasEditableTeam = useMemo(
    () =>
      currentAssignments.some((a) => !marshalBlockByTeamEntryId[a.teamEntryId]),
    [currentAssignments, marshalBlockByTeamEntryId]
  );

  const allTeamsMarshalBlocked = useMemo(
    () =>
      currentAssignments.length > 0 &&
      currentAssignments.every((a) => marshalBlockByTeamEntryId[a.teamEntryId]),
    [currentAssignments, marshalBlockByTeamEntryId]
  );

  const slotSummary = useMemo(
    () => ({
      filled: countFilledSlots(currentAssignments),
      total: countTotalSlots(currentAssignments),
    }),
    [currentAssignments]
  );

  const setSlotUser = (teamEntryId: string, slotIndex: number, userId: string | null) => {
    setDraftAssignments((prev) => ({
      ...prev,
      [selectedClubId]: (prev[selectedClubId] ?? []).map((assignment) => {
        if (assignment.teamEntryId !== teamEntryId) return assignment;
        const nextSlots = [...assignment.memberSlots];
        if (slotIndex < 0 || slotIndex >= nextSlots.length) return assignment;

        if (userId) {
          for (let i = 0; i < nextSlots.length; i++) {
            if (i !== slotIndex && nextSlots[i] === userId) {
              nextSlots[i] = null;
            }
          }
        }
        nextSlots[slotIndex] = userId;
        return { ...assignment, memberSlots: nextSlots, memberUserIds: compactUserIds(nextSlots) };
      }),
    }));
  };

  const handleSave = async () => {
    if (!selectedClubId) {
      toast.error("クラブを選択してください");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/team-assignments`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clubId: selectedClubId,
          assignments: currentAssignments.map((assignment) => ({
            teamEntryId: assignment.teamEntryId,
            memberSlots: assignment.memberSlots,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "チームメンバー割当の更新に失敗しました");
      }

      setDraftAssignments((prev) => ({
        ...prev,
        [selectedClubId]: currentAssignments,
      }));
      toast.success("チームメンバー割当を更新しました");
      router.refresh();
    } catch (error) {
      console.error("Team assignment save error:", error);
      toast.error(
        error instanceof Error ? error.message : "チームメンバー割当の更新に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const statusKind = !isAssignmentWindowOpen
    ? "closed"
    : allTeamsMarshalBlocked
      ? "marshal"
      : "open";

  const fillPercent =
    slotSummary.total > 0 ? Math.round((slotSummary.filled / slotSummary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border-border/80 shadow-md">
        <CardHeader className="border-b border-border/60 bg-gradient-to-br from-primary/[0.06] via-muted/30 to-muted/10 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/80 text-primary shadow-sm ring-1 ring-border/60"
                aria-hidden
              >
                <ClipboardList className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold tracking-tight">
                  クラブの選択と割当
                </CardTitle>
                <CardDescription className="max-w-2xl text-pretty leading-relaxed">
                  種目のポジション順にメンバーを選びます。上から順にスタートリストへ反映されます。
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "flex gap-3 rounded-xl border p-4 text-sm shadow-sm",
              statusKind === "open" &&
                "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50",
              statusKind === "closed" &&
                "border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-50",
              statusKind === "marshal" &&
                "border-destructive/25 bg-destructive/5 text-destructive dark:border-destructive/40 dark:bg-destructive/10 dark:text-destructive"
            )}
          >
            <div className="mt-0.5 shrink-0">
              {statusKind === "open" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : statusKind === "marshal" ? (
                <Lock className="h-5 w-5" aria-hidden />
              ) : (
                <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">目安日時（通知用）</span>
                <span className="tabular-nums text-muted-foreground">{assignmentDeadlineLabel}</span>
                {statusKind === "open" ? (
                  <Badge
                    variant="secondary"
                    className="border-emerald-300/60 bg-emerald-100/90 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100"
                  >
                    割当可能
                  </Badge>
                ) : statusKind === "marshal" ? (
                  <Badge variant="destructive">全チーム・マーシャル締切済み</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-100/90 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
                    期間外
                  </Badge>
                )}
              </div>
              <p className="leading-relaxed text-pretty">
                {isAssignmentWindowOpen
                  ? allTeamsMarshalBlocked
                    ? "このクラブのチームはすべて、スタートリスト上のヒートでマーシャル締切済みのため、メンバーを変更できません。"
                    : "編集の確定は、各チームがスタートリスト上で乗るヒートのマーシャル締切までです。上記の日時は通知用の目安であり、編集可否の上限には使いません。"
                  : "エントリー終了後から割当できます。現在はエントリー期間中か、終了前のため編集できません。"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2 sm:min-w-[min(100%,20rem)] sm:flex-1">
                <Label htmlFor="assignment-club-select" className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  対象クラブ
                </Label>
                {clubs.length > 1 ? (
                  <Select value={selectedClubId} onValueChange={setSelectedClubId}>
                    <SelectTrigger id="assignment-club-select" className="h-11 w-full">
                      <SelectValue placeholder="クラブを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {clubs.map((club) => (
                        <SelectItem key={club.id} value={club.id}>
                          {club.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p
                    id="assignment-club-select"
                    className="flex h-11 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground"
                  >
                    {selectedClubLabel || "—"}
                  </p>
                )}
              </div>
              {eligibleMembers.length > 0 && currentAssignments.length > 0 ? (
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[12rem] sm:items-end">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground sm:justify-end">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/70 px-3 py-1.5 ring-1 ring-border/50">
                      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      候補{" "}
                      <strong className="tabular-nums text-foreground">{eligibleMembers.length}</strong> 名
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/70 px-3 py-1.5 ring-1 ring-border/50">
                      割当{" "}
                      <strong className="tabular-nums text-foreground">{slotSummary.filled}</strong> /{" "}
                      <span className="tabular-nums">{slotSummary.total}</span> 枠
                    </span>
                  </div>
                  <div className="w-full space-y-1 sm:max-w-xs">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>枠の埋まり</span>
                      <span className="tabular-nums font-medium text-foreground">{fillPercent}%</span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={slotSummary.filled}
                      aria-valuemin={0}
                      aria-valuemax={slotSummary.total}
                      aria-label={`割当済み ${slotSummary.filled} / ${slotSummary.total} 枠`}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {currentAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 px-6 py-14 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-inner">
                <Users className="h-7 w-7" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">チームエントリーがありません</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                このクラブで大会に登録されているチーム種目がありません。先にチームエントリーを登録してください。
              </p>
            </div>
          ) : eligibleMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 px-6 py-14 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-inner">
                <Users className="h-7 w-7" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">割当できるメンバーがいません</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                エントリーが提出済みのクラブメンバーがいないため、ここからは割当できません。
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {currentAssignments.map((assignment) => {
                const teamMarshalBlocked = Boolean(marshalBlockByTeamEntryId[assignment.teamEntryId]);
                return (
                <div
                  key={assignment.teamEntryId}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow",
                    teamMarshalBlocked
                      ? "border-amber-500/35 border-l-4 border-l-amber-500/70"
                      : "border-border/80 border-l-4 border-l-primary/45"
                  )}
                >
                  <div className="border-b border-border/60 bg-gradient-to-r from-muted/50 to-transparent px-4 py-3 sm:px-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-base font-semibold leading-snug text-foreground">
                          {assignment.eventName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          チーム <span className="font-medium text-foreground">{assignment.teamName}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-normal">
                          {assignment.sexLabel}
                        </Badge>
                        <Badge variant="secondary" className="tabular-nums">
                          {assignment.memberSlots.length} 枠
                        </Badge>
                        {assignment.relayPositionCount == null ? (
                          <span className="text-xs text-muted-foreground">種目のポジション数は未設定</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {teamMarshalBlocked ? (
                    <div className="flex items-start gap-2 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50 sm:px-5">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span className="leading-relaxed">
                        このチームが乗るヒートはマーシャル締切済みのため、メンバーを変更できません。
                      </span>
                    </div>
                  ) : null}
                  <div className="divide-y divide-border/50">
                    {assignment.memberSlots.map((selectedUserId, slotIndex) => {
                      const takenElsewhere = new Set(
                        assignment.memberSlots
                          .map((uid, i) => (i !== slotIndex && uid ? uid : null))
                          .filter((x): x is string => Boolean(x))
                      );
                      const eventJson = teamAssignmentEventsById?.[assignment.eventId];
                      const competitionJson = teamAssignmentCompetition ?? undefined;
                      return (
                        <div
                          key={`${assignment.teamEntryId}-slot-${slotIndex}`}
                          className={cn(
                            "flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4",
                            slotIndex % 2 === 1 && "bg-muted/25"
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3 sm:w-[min(100%,14rem)] sm:shrink-0">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums text-muted-foreground"
                              aria-hidden
                            >
                              {slotIndex + 1}
                            </span>
                            <span className="truncate text-sm font-medium text-foreground">
                              {slotLabel(assignment, slotIndex)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 sm:max-w-xl">
                            <Select
                              value={selectedUserId ?? EMPTY_SLOT_VALUE}
                              onValueChange={(v) =>
                                setSlotUser(
                                  assignment.teamEntryId,
                                  slotIndex,
                                  v === EMPTY_SLOT_VALUE ? null : v
                                )
                              }
                              disabled={
                                !isAssignmentWindowOpen ||
                                Boolean(marshalBlockByTeamEntryId[assignment.teamEntryId])
                              }
                            >
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue placeholder="メンバーを選択" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_SLOT_VALUE}>未選択</SelectItem>
                                {eligibleMembers.map((member) => {
                                  const reason = memberOptionDisabledReason({
                                    member,
                                    selectedUserId,
                                    takenElsewhere,
                                    eventJson,
                                    competitionJson,
                                  });
                                  return (
                                    <SelectItem
                                      key={`${assignment.teamEntryId}-${slotIndex}-${member.userId}`}
                                      value={member.userId}
                                      disabled={Boolean(reason)}
                                    >
                                      {member.name}
                                      {reason ? `（${reason}）` : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-col gap-3 rounded-xl border border-border/80 bg-background/95 px-4 py-4 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.12)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:mt-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-none sm:border-0 sm:border-t sm:border-border/60 sm:bg-transparent sm:px-0 sm:py-0 sm:pt-6 sm:shadow-none sm:backdrop-blur-none">
            <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-md">
              {isAssignmentWindowOpen
                ? hasEditableTeam
                  ? "変更後は必ず保存してください。未保存の内容は失われます。"
                  : "編集可能なチームがありません（すべてマーシャル締切済み、または割当対象がありません）。"
                : "割当期間外のため保存はできません。"}
            </p>
            <Button
              type="button"
              size="lg"
              className="w-full shrink-0 gap-2 sm:w-auto"
              onClick={handleSave}
              disabled={isSaving || !isAssignmentWindowOpen || !hasEditableTeam}
            >
              {isSaving ? (
                "保存中…"
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden />
                  メンバー割当を保存
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function compactUserIds(slots: (string | null)[]): string[] {
  return slots.filter((uid): uid is string => Boolean(uid));
}
