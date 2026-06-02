"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildResultRoundLabelMap,
  displayResultRoundLabel,
  type ResultRoundUiKey,
} from "@/lib/resultRoundLabels";

type EventOption = {
  id: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  type: "INDIVIDUAL" | "TEAM";
  startListRoundCount?: number;
};

type Candidate = {
  id: string;
  label: string;
};

type RowState = {
  localId: string;
  entryType: "INDIVIDUAL" | "TEAM";
  competitionEntryId: string;
  teamEntryId: string;
  rank: string;
  status: "OK" | "DNS" | "DNF" | "DSQ" | "WITHDRAWN";
  resultText: string;
  lane: string;
  heat: string;
  remarks: string;
};

type ApiRow = {
  id: string;
  entryType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string | null;
  teamEntryId?: string | null;
  rank?: number | null;
  status?: "OK" | "DNS" | "DNF" | "DSQ" | "WITHDRAWN";
  resultText?: string | null;
  lane?: number | null;
  heat?: number | null;
  remarks?: string | null;
};

type ApiResult = {
  id: string;
  round: "FINAL" | "HEAT" | "SEMI";
  publishedAt?: string | null;
  lockedAt?: string | null;
  note?: string | null;
  rows: ApiRow[];
};

function toLocalDateTimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function fromLocalDateTimeValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function makeEmptyRow(entryType: "INDIVIDUAL" | "TEAM"): RowState {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entryType,
    competitionEntryId: "",
    teamEntryId: "",
    rank: "",
    status: "OK",
    resultText: "",
    lane: "",
    heat: "",
    remarks: "",
  };
}

type OfficialResultManagerProps = {
  competitionId: string;
  canEdit: boolean;
};

export function OfficialResultManager({
  competitionId,
  canEdit,
}: OfficialResultManagerProps) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [round, setRound] = useState<"FINAL" | "HEAT" | "SEMI">("FINAL");
  const [startListSettings, setStartListSettings] = useState<unknown>(null);
  const [publishedAt, setPublishedAt] = useState<string>("");
  const [lockedAt, setLockedAt] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [individualCandidates, setIndividualCandidates] = useState<Candidate[]>([]);
  const [teamCandidates, setTeamCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId),
    [events, eventId]
  );

  const roundLabelMap = useMemo(() => {
    if (!eventId) return {};
    return buildResultRoundLabelMap(
      startListSettings,
      eventId,
      selectedEvent?.startListRoundCount
    );
  }, [startListSettings, eventId, selectedEvent?.startListRoundCount]);

  const roundSelectItems = useMemo(() => {
    const keys: ResultRoundUiKey[] = ["HEAT", "SEMI", "FINAL"];
    return keys.map((k) => ({
      value: k,
      label: displayResultRoundLabel(k, roundLabelMap),
    }));
  }, [roundLabelMap]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const [evRes, compRes] = await Promise.all([
          fetch(`/api/competitions/${competitionId}/events`),
          fetch(`/api/competitions/${competitionId}`),
        ]);
        if (!evRes.ok) {
          throw new Error("種目の取得に失敗しました");
        }
        const data = (await evRes.json()) as { events?: EventOption[] };
        const fetched = Array.isArray(data.events) ? data.events : [];
        setEvents(fetched);
        if (fetched.length > 0) {
          setEventId(fetched[0].id);
        }
        if (compRes.ok) {
          const compJson = (await compRes.json()) as { competition?: { startListSettings?: unknown } };
          setStartListSettings(compJson.competition?.startListSettings ?? null);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "種目の取得に失敗しました");
      }
    };
    if (canEdit) {
      void loadEvents();
    }
  }, [competitionId, canEdit]);

  useEffect(() => {
    const loadCandidates = async () => {
      if (!eventId) return;
      try {
        const candidatesRes = await fetch(
          `/api/competitions/${competitionId}/events/${eventId}/result-candidates`
        );
        if (!candidatesRes.ok) {
          throw new Error("結果候補の取得に失敗しました");
        }
        const candidatesJson = (await candidatesRes.json()) as {
          individualCandidates?: Candidate[];
          teamCandidates?: Candidate[];
        };
        setIndividualCandidates(candidatesJson.individualCandidates ?? []);
        setTeamCandidates(candidatesJson.teamCandidates ?? []);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "結果候補の取得に失敗しました");
      }
    };
    if (canEdit) {
      void loadCandidates();
    }
  }, [competitionId, eventId, canEdit]);

  useEffect(() => {
    const loadResult = async () => {
      if (!eventId) return;
      try {
        setIsLoading(true);
        const resultRes = await fetch(
          `/api/competitions/${competitionId}/events/${eventId}/official-result?round=${encodeURIComponent(round)}`
        );
        if (!resultRes.ok) {
          throw new Error("既存結果の取得に失敗しました");
        }

        const resultJson = (await resultRes.json()) as { results?: ApiResult[] };
        const matched = (resultJson.results ?? []).find((result) => result.round === round);
        if (matched) {
          setPublishedAt(toLocalDateTimeValue(matched.publishedAt));
          setLockedAt(toLocalDateTimeValue(matched.lockedAt));
          setNote(matched.note ?? "");
          setRows(
            matched.rows.map((row) => ({
              localId: row.id,
              entryType: row.entryType,
              competitionEntryId: row.competitionEntryId ?? "",
              teamEntryId: row.teamEntryId ?? "",
              rank: row.rank != null ? String(row.rank) : "",
              status: row.status ?? "OK",
              resultText: row.resultText ?? "",
              lane: row.lane != null ? String(row.lane) : "",
              heat: row.heat != null ? String(row.heat) : "",
              remarks: row.remarks ?? "",
            }))
          );
        } else {
          setPublishedAt("");
          setLockedAt("");
          setNote("");
          setRows([]);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    if (canEdit) {
      void loadResult();
    }
  }, [competitionId, eventId, round, canEdit]);

  const addRow = () => {
    const nextType = selectedEvent?.type ?? "INDIVIDUAL";
    setRows((prev) => [...prev, makeEmptyRow(nextType)]);
  };

  const updateRow = (localId: string, patch: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (localId: string) => {
    setRows((prev) => prev.filter((row) => row.localId !== localId));
  };

  const handleSave = async () => {
    if (!eventId) {
      toast.error("種目を選択してください");
      return;
    }

    const payloadRows = rows.map((row) => {
      const rankNum = row.rank ? Number(row.rank) : null;
      const laneNum = row.lane ? Number(row.lane) : null;
      const heatNum = row.heat ? Number(row.heat) : null;
      return {
        entryType: row.entryType,
        competitionEntryId: row.entryType === "INDIVIDUAL" ? row.competitionEntryId || null : null,
        teamEntryId: row.entryType === "TEAM" ? row.teamEntryId || null : null,
        rank: Number.isFinite(rankNum) ? rankNum : null,
        status: row.status,
        resultText: row.resultText.trim() || null,
        lane: Number.isFinite(laneNum) ? laneNum : null,
        heat: Number.isFinite(heatNum) ? heatNum : null,
        remarks: row.remarks.trim() || null,
      };
    });

    const invalid = payloadRows.find(
      (row) =>
        (row.entryType === "INDIVIDUAL" && !row.competitionEntryId) ||
        (row.entryType === "TEAM" && !row.teamEntryId)
    );
    if (invalid) {
      toast.error("各行で対象エントリーを選択してください");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch(
        `/api/competitions/${competitionId}/events/${eventId}/official-result`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            round,
            publishedAt: fromLocalDateTimeValue(publishedAt),
            lockedAt: fromLocalDateTimeValue(lockedAt),
            note: note.trim() || null,
            rows: payloadRows,
          }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "保存に失敗しました");
      }
      toast.success("公式結果を保存しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>公式結果管理</CardTitle>
          <CardDescription>この操作には管理権限が必要です。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>公式結果管理</CardTitle>
        <CardDescription>
          種目ごとに結果を登録し、公開日時と確定日時を設定できます。競技中の失格（DSQ）はスタートリストの失格管理から登録すると、公開用の公式結果に自動反映されます（この画面では DSQ を手入力しません）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>種目</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="種目を選択" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}（
                    {event.sex === "MALE" ? "男子" : event.sex === "FEMALE" ? "女子" : "混合"}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ラウンド</Label>
            <Select
              value={round}
              onValueChange={(value) => setRound(value as "FINAL" | "HEAT" | "SEMI")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roundSelectItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={addRow} disabled={!eventId}>
              行を追加
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="publishedAt">公開日時（任意）</Label>
            <Input
              id="publishedAt"
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lockedAt">確定日時（任意）</Label>
            <Input
              id="lockedAt"
              type="datetime-local"
              value={lockedAt}
              onChange={(e) => setLockedAt(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resultNote">備考</Label>
          <Textarea
            id="resultNote"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="結果に関する補足"
          />
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              行がありません。「行を追加」から結果を入力してください。
            </p>
          ) : (
            rows.map((row, index) => {
              const options =
                row.entryType === "INDIVIDUAL" ? individualCandidates : teamCandidates;
              return (
                <div key={row.localId} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">行 {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.localId)}
                    >
                      削除
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>エントリー種別</Label>
                      <Select
                        value={row.entryType}
                        onValueChange={(value) =>
                          updateRow(row.localId, {
                            entryType: value as "INDIVIDUAL" | "TEAM",
                            competitionEntryId: "",
                            teamEntryId: "",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INDIVIDUAL">個人</SelectItem>
                          <SelectItem value="TEAM">チーム</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>対象エントリー</Label>
                      <Select
                        value={
                          row.entryType === "INDIVIDUAL"
                            ? row.competitionEntryId
                            : row.teamEntryId
                        }
                        onValueChange={(value) =>
                          row.entryType === "INDIVIDUAL"
                            ? updateRow(row.localId, { competitionEntryId: value })
                            : updateRow(row.localId, { teamEntryId: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="候補を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="space-y-2">
                      <Label>順位</Label>
                      <Input
                        numericInput="integer"
                        min="1"
                        value={row.rank}
                        onChange={(e) => updateRow(row.localId, { rank: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ステータス</Label>
                      {row.status === "DSQ" ? (
                        <p className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                          DSQ（当日運用から反映）
                        </p>
                      ) : (
                        <Select
                          value={row.status}
                          onValueChange={(value) =>
                            updateRow(row.localId, {
                              status: value as "OK" | "DNS" | "DNF" | "DSQ" | "WITHDRAWN",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OK">OK</SelectItem>
                            <SelectItem value="DNS">DNS</SelectItem>
                            <SelectItem value="DNF">DNF</SelectItem>
                            <SelectItem value="WITHDRAWN">棄権</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>レーン</Label>
                      <Input
                        numericInput="integer"
                        min="1"
                        value={row.lane}
                        onChange={(e) => updateRow(row.localId, { lane: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ヒート</Label>
                      <Input
                        numericInput="integer"
                        min="1"
                        value={row.heat}
                        onChange={(e) => updateRow(row.localId, { heat: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>結果テキスト</Label>
                      <Input
                        value={row.resultText}
                        onChange={(e) => updateRow(row.localId, { resultText: e.target.value })}
                        placeholder="例: 1:02.34"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>備考</Label>
                    <Input
                      value={row.remarks}
                      onChange={(e) => updateRow(row.localId, { remarks: e.target.value })}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={isSaving || !eventId}>
            {isSaving ? "保存中..." : "公式結果を保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
