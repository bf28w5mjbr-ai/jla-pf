"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Loader2, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import { userFacingApiErrorMessage } from "@/lib/userFacingApiError";

export type HostInviteEventOption = {
  id: string;
  name: string;
  sex: string;
  requiresEntryTime: boolean;
};

export type HostInviteTeamEventOption = {
  id: string;
  name: string;
  sex: string;
  maxTeamEntriesPerClub?: number | null;
};

type SearchUser = {
  id: string;
  displayName: string;
  email: string;
  phoneNumber: string | null;
};

type SearchClub = {
  id: string;
  name: string;
  abbreviation?: string | null;
};

type ClubTeamStatus = {
  count: number;
  teamNames: string[];
};

type InviteMode = "individual" | "team";

const sexLabel = (sex: string) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

type Props = {
  competitionId: string;
  individualEvents: HostInviteEventOption[];
  teamEvents: HostInviteTeamEventOption[];
};

function filterEventsByQuery<
  T extends { id: string; name: string; sex: string },
>(events: T[], query: string): T[] {
  if (query.length === 0) return [];
  return events.filter((ev) => {
    const sex = sexLabel(ev.sex);
    const full = `${ev.name}（${sex}）`;
    return (
      ev.name.includes(query) ||
      sex.includes(query) ||
      full.includes(query)
    );
  });
}

export default function CompetitionHostInviteEntryPanel({
  competitionId,
  individualEvents,
  teamEvents,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<InviteMode>(() =>
    individualEvents.length > 0 ? "individual" : "team"
  );

  const [userQ, setUserQ] = useState("");
  const [userSearching, setUserSearching] = useState(false);
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(() => new Set());
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>({});
  const [eventQuery, setEventQuery] = useState("");

  const [clubQ, setClubQ] = useState("");
  const [clubSearching, setClubSearching] = useState(false);
  const [clubResults, setClubResults] = useState<SearchClub[]>([]);
  const [selectedClub, setSelectedClub] = useState<SearchClub | null>(null);
  const [existingByEvent, setExistingByEvent] = useState<Record<string, ClubTeamStatus>>({});
  const [additionsByEvent, setAdditionsByEvent] = useState<Record<string, number>>({});
  const [clubTeamsLoading, setClubTeamsLoading] = useState(false);

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasAnyEvents = individualEvents.length > 0 || teamEvents.length > 0;

  const eventSearchTrimmed = eventQuery.trim();
  const filteredIndividualEventPickList = useMemo(
    () => filterEventsByQuery(individualEvents, eventSearchTrimmed),
    [individualEvents, eventSearchTrimmed]
  );

  useEffect(() => {
    const term = userQ.trim();
    if (term.length < 2) {
      setUserResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setUserSearching(true);
        try {
          const res = await fetch(
            `/api/competitions/${competitionId}/entries/host-invite-user-search?q=${encodeURIComponent(term)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            toast.error(typeof data.error === "string" ? data.error : "検索に失敗しました");
            setUserResults([]);
            return;
          }
          const users = Array.isArray(data.users) ? data.users : [];
          setUserResults(
            users.filter(
              (u: unknown): u is SearchUser =>
                !!u &&
                typeof u === "object" &&
                typeof (u as SearchUser).id === "string" &&
                typeof (u as SearchUser).displayName === "string"
            )
          );
        } finally {
          if (!cancelled) setUserSearching(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [userQ, competitionId]);

  useEffect(() => {
    const term = clubQ.trim();
    if (term.length < 2) {
      setClubResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setClubSearching(true);
        try {
          const res = await fetch(
            `/api/competitions/${competitionId}/entries/host-invite-club-search?q=${encodeURIComponent(term)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            toast.error(typeof data.error === "string" ? data.error : "クラブ検索に失敗しました");
            setClubResults([]);
            return;
          }
          const clubs = Array.isArray(data.clubs) ? data.clubs : [];
          setClubResults(
            clubs.filter(
              (c: unknown): c is SearchClub =>
                !!c &&
                typeof c === "object" &&
                typeof (c as SearchClub).id === "string" &&
                typeof (c as SearchClub).name === "string"
            )
          );
        } finally {
          if (!cancelled) setClubSearching(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clubQ, competitionId]);

  useEffect(() => {
    if (!selectedClub) {
      setExistingByEvent({});
      setAdditionsByEvent({});
      return;
    }
    let cancelled = false;
    void (async () => {
      setClubTeamsLoading(true);
      try {
        const res = await fetch(
          `/api/competitions/${competitionId}/entries/host-invite-club-teams?clubId=${encodeURIComponent(selectedClub.id)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          toast.error(typeof data.error === "string" ? data.error : "登録状況の取得に失敗しました");
          setExistingByEvent({});
          setAdditionsByEvent({});
          return;
        }
        const byEvent =
          data.byEvent && typeof data.byEvent === "object" && !Array.isArray(data.byEvent)
            ? (data.byEvent as Record<string, ClubTeamStatus>)
            : {};
        setExistingByEvent(byEvent);
        setAdditionsByEvent({});
      } finally {
        if (!cancelled) setClubTeamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClub, competitionId]);

  const resetIndividualForm = () => {
    setSelectedUser(null);
    setSelectedEventIds(new Set());
    setEntryTimes({});
    setUserQ("");
    setUserResults([]);
    setEventQuery("");
  };

  const resetTeamForm = () => {
    setSelectedClub(null);
    setExistingByEvent({});
    setAdditionsByEvent({});
    setClubQ("");
    setClubResults([]);
  };

  const resetFormAfterSubmit = () => {
    if (mode === "individual") {
      resetIndividualForm();
    } else {
      resetTeamForm();
    }
    setNotes("");
  };

  const addEvent = (id: string) => {
    setSelectedEventIds((prev) => new Set(prev).add(id));
  };

  const removeEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEntryTimes((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleModeChange = (next: string) => {
    if (next !== "individual" && next !== "team") return;
    setMode(next);
  };

  const setAddCountForEvent = (eventId: string, rawNext: number, maxAdd: number | null) => {
    setAdditionsByEvent((prev) => {
      let next = Math.max(0, Math.floor(Number.isFinite(rawNext) ? rawNext : 0));
      if (maxAdd != null) next = Math.min(next, maxAdd);
      if (next === 0) {
        const { [eventId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [eventId]: next };
    });
  };

  const selectedIndividualEvents = useMemo(
    () => individualEvents.filter((e) => selectedEventIds.has(e.id)),
    [individualEvents, selectedEventIds]
  );

  const teamAdditionsList = useMemo(
    () =>
      teamEvents
        .map((e) => ({ event: e, addCount: additionsByEvent[e.id] ?? 0 }))
        .filter((row) => row.addCount > 0),
    [teamEvents, additionsByEvent]
  );

  const canSubmitIndividual =
    selectedUser &&
    selectedIndividualEvents.length > 0 &&
    selectedIndividualEvents.every(
      (e) => !e.requiresEntryTime || (entryTimes[e.id]?.trim()?.length ?? 0) > 0
    );

  const canSubmitTeam = selectedClub && teamAdditionsList.length > 0 && !clubTeamsLoading;

  const handleSubmitIndividual = async () => {
    if (!selectedUser || !canSubmitIndividual) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/entries/host-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          items: selectedIndividualEvents.map((e) => ({
            eventId: e.id,
            entryTime: e.requiresEntryTime ? entryTimes[e.id]?.trim() || null : null,
          })),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(userFacingApiErrorMessage(data, "登録に失敗しました"));
        return;
      }
      toast.success(typeof data.message === "string" ? data.message : "登録しました");
      resetFormAfterSubmit();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitTeam = async () => {
    if (!selectedClub || !canSubmitTeam) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/entries/host-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId: selectedClub.id,
          additions: teamAdditionsList.map(({ event, addCount }) => ({
            eventId: event.id,
            addCount,
          })),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(userFacingApiErrorMessage(data, "登録に失敗しました"));
        return;
      }
      toast.success(typeof data.message === "string" ? data.message : "登録しました");
      resetFormAfterSubmit();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasAnyEvents) {
    return (
      <div className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
        招待登録できる種目がありません。
      </div>
    );
  }

  const renderSelectedIndividualEvents = () => {
    if (selectedIndividualEvents.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-border bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
          まだありません。上の検索から追加してください。
        </p>
      );
    }
    return (
      <ul className="space-y-2">
        {selectedIndividualEvents.map((ev) => (
          <li key={ev.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">{ev.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">（{sexLabel(ev.sex)}）</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => removeEvent(ev.id)}
                aria-label={`${ev.name}を外す`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {ev.requiresEntryTime ? (
              <div className="mt-2">
                <Input
                  value={entryTimes[ev.id] ?? ""}
                  onChange={(e) =>
                    setEntryTimes((prev) => ({ ...prev, [ev.id]: e.target.value }))
                  }
                  placeholder="エントリータイム（必須）"
                  className="h-9 max-w-xs text-sm"
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">招待・手動エントリー</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              個人種目は登録済みユーザーを検索して追加します。チーム種目はクラブを選び、種目ごとに追加する組数を指定します（参加費なし・主催登録）。チーム名はクラブ略称から自動設定されます。メンバー割当はクラブのチーム管理画面で行います。
            </p>
          </div>
        </div>
      </div>

      <Tabs value={mode} onValueChange={handleModeChange} className="px-4 pt-4 sm:px-5">
        <TabsList className="grid h-9 w-full max-w-md grid-cols-2">
          <TabsTrigger value="individual" disabled={individualEvents.length === 0} className="text-xs">
            個人種目
          </TabsTrigger>
          <TabsTrigger value="team" disabled={teamEvents.length === 0} className="text-xs">
            チーム種目
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="mt-0 space-y-5 pb-4 pt-4">
          {individualEvents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              個人種目がないため、ここからの個人招待登録はできません。
            </p>
          ) : (
            <InviteFormBody
              q={userQ}
              setQ={setUserQ}
              searching={userSearching}
              results={userResults}
              selected={selectedUser}
              onSelectUser={(u) => {
                setSelectedUser(u);
                setUserResults([]);
                setUserQ("");
              }}
              onClearUser={() => setSelectedUser(null)}
              eventQuery={eventQuery}
              setEventQuery={setEventQuery}
              eventSearchTrimmed={eventSearchTrimmed}
              filteredEventPickList={filteredIndividualEventPickList}
              selectedEventIds={selectedEventIds}
              onAddEvent={addEvent}
              eventSectionTitle="個人種目（複数可）"
              eventSectionHint="種目名の一部で検索し、リストから選んで追加します。一覧には出しません。"
              eventSearchId="host-invite-individual-event-search"
              renderSelectedEvents={renderSelectedIndividualEvents}
              notes={notes}
              setNotes={setNotes}
              canSubmit={!!canSubmitIndividual}
              submitting={submitting}
              submitLabel="エントリーを登録する"
              onSubmit={() => void handleSubmitIndividual()}
            />
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-0 space-y-5 pb-4 pt-4">
          {teamEvents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              チーム種目がないため、ここからのチーム追加はできません。
            </p>
          ) : (
            <TeamClubInviteForm
              clubQ={clubQ}
              setClubQ={setClubQ}
              clubSearching={clubSearching}
              clubResults={clubResults}
              selectedClub={selectedClub}
              onSelectClub={(c) => {
                setSelectedClub(c);
                setClubResults([]);
                setClubQ("");
              }}
              onClearClub={() => setSelectedClub(null)}
              clubTeamsLoading={clubTeamsLoading}
              teamEvents={teamEvents}
              existingByEvent={existingByEvent}
              additionsByEvent={additionsByEvent}
              setAddCountForEvent={setAddCountForEvent}
              notes={notes}
              setNotes={setNotes}
              canSubmit={!!canSubmitTeam}
              submitting={submitting}
              onSubmit={() => void handleSubmitTeam()}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InviteFormBody({
  q,
  setQ,
  searching,
  results,
  selected,
  onSelectUser,
  onClearUser,
  eventQuery,
  setEventQuery,
  eventSearchTrimmed,
  filteredEventPickList,
  selectedEventIds,
  onAddEvent,
  eventSectionTitle,
  eventSectionHint,
  eventSearchId,
  renderSelectedEvents,
  notes,
  setNotes,
  canSubmit,
  submitting,
  submitLabel,
  onSubmit,
}: {
  q: string;
  setQ: (v: string) => void;
  searching: boolean;
  results: SearchUser[];
  selected: SearchUser | null;
  onSelectUser: (u: SearchUser) => void;
  onClearUser: () => void;
  eventQuery: string;
  setEventQuery: (v: string) => void;
  eventSearchTrimmed: string;
  filteredEventPickList: { id: string; name: string; sex: string }[];
  selectedEventIds: Set<string>;
  onAddEvent: (id: string) => void;
  eventSectionTitle: string;
  eventSectionHint: string;
  eventSearchId: string;
  renderSelectedEvents: () => ReactNode;
  notes: string;
  setNotes: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">選手を検索</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="メール・電話・氏名の一部（2文字以上）"
            className="h-10 pl-9 pr-10"
            autoComplete="off"
          />
          {searching ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {q.trim().length >= 2 && results.length > 0 && !selected ? (
          <ul className="max-h-48 overflow-auto rounded-lg border border-border bg-background text-sm shadow-sm">
            {results.map((u) => (
              <li key={u.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition hover:bg-muted/60"
                  onClick={() => onSelectUser(u)}
                >
                  <span className="font-medium text-foreground">{u.displayName}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                  {u.phoneNumber ? (
                    <span className="font-mono text-[11px] text-muted-foreground">{u.phoneNumber}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {q.trim().length >= 2 && !searching && results.length === 0 && !selected ? (
          <p className="text-xs text-muted-foreground">該当するユーザーがいません。</p>
        ) : null}
      </div>

      {selected ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">選択中</p>
              <p className="text-sm font-semibold">{selected.displayName}</p>
              <p className="text-xs text-muted-foreground">{selected.email}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearUser}>
              変更
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{eventSectionTitle}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{eventSectionHint}</p>
        </div>
        <label className="sr-only" htmlFor={eventSearchId}>
          種目を検索
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={eventSearchId}
            value={eventQuery}
            onChange={(e) => setEventQuery(e.target.value)}
            placeholder="種目名の一部で検索"
            className="h-10 pl-9"
            autoComplete="off"
          />
        </div>
        {eventSearchTrimmed.length > 0 && filteredEventPickList.length > 0 ? (
          <ul className="max-h-48 overflow-auto rounded-lg border border-border bg-background text-sm shadow-sm">
            {filteredEventPickList.map((ev) => {
              const already = selectedEventIds.has(ev.id);
              return (
                <li key={ev.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    disabled={already}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      if (!already) onAddEvent(ev.id);
                    }}
                  >
                    <span className="font-medium text-foreground">
                      {ev.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        （{sexLabel(ev.sex)}）
                      </span>
                      {already ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">・追加済み</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {eventSearchTrimmed.length > 0 && filteredEventPickList.length === 0 ? (
          <p className="text-xs text-muted-foreground">該当する種目がありません。</p>
        ) : null}

        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">選択した種目</p>
          {renderSelectedEvents()}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">メモ（任意・内部用）</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="例: 招待選手、海外からの参加 など"
          className="h-10"
          maxLength={2000}
        />
      </div>

      <Button type="button" className="w-full sm:w-auto" disabled={!canSubmit || submitting} onClick={onSubmit}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            登録中…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </>
  );
}

function TeamClubInviteForm({
  clubQ,
  setClubQ,
  clubSearching,
  clubResults,
  selectedClub,
  onSelectClub,
  onClearClub,
  clubTeamsLoading,
  teamEvents,
  existingByEvent,
  additionsByEvent,
  setAddCountForEvent,
  notes,
  setNotes,
  canSubmit,
  submitting,
  onSubmit,
}: {
  clubQ: string;
  setClubQ: (v: string) => void;
  clubSearching: boolean;
  clubResults: SearchClub[];
  selectedClub: SearchClub | null;
  onSelectClub: (c: SearchClub) => void;
  onClearClub: () => void;
  clubTeamsLoading: boolean;
  teamEvents: HostInviteTeamEventOption[];
  existingByEvent: Record<string, ClubTeamStatus>;
  additionsByEvent: Record<string, number>;
  setAddCountForEvent: (eventId: string, next: number, maxAdd: number | null) => void;
  notes: string;
  setNotes: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">クラブを検索</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={clubQ}
            onChange={(e) => setClubQ(e.target.value)}
            placeholder="クラブ名・略称の一部（2文字以上）"
            className="h-10 pl-9 pr-10"
            autoComplete="off"
          />
          {clubSearching ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {clubQ.trim().length >= 2 && clubResults.length > 0 && !selectedClub ? (
          <ul className="max-h-48 overflow-auto rounded-lg border border-border bg-background text-sm shadow-sm">
            {clubResults.map((c) => (
              <li key={c.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition hover:bg-muted/60"
                  onClick={() => onSelectClub(c)}
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.abbreviation ? (
                    <span className="text-xs text-muted-foreground">略称: {c.abbreviation}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {clubQ.trim().length >= 2 && !clubSearching && clubResults.length === 0 && !selectedClub ? (
          <p className="text-xs text-muted-foreground">該当するクラブがありません。</p>
        ) : null}
      </div>

      {selectedClub ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">選択中のクラブ</p>
                <p className="text-sm font-semibold">{selectedClub.name}</p>
                {selectedClub.abbreviation ? (
                  <p className="text-xs text-muted-foreground">略称: {selectedClub.abbreviation}</p>
                ) : null}
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearClub}>
              変更
            </Button>
          </div>
        </div>
      ) : null}

      {selectedClub ? (
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">チーム種目ごとの追加</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              登録済みの組数を確認し、今回追加する組数を指定してください。チーム名はクラブ略称（なければ正式名）から自動設定されます。
            </p>
          </div>
          {clubTeamsLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              登録状況を読み込み中…
            </div>
          ) : (
            <div className="divide-y rounded-lg border border-border bg-card/80">
              {teamEvents.map((event) => {
                const existing = existingByEvent[event.id]?.count ?? 0;
                const existingNames = existingByEvent[event.id]?.teamNames ?? [];
                const addCount = additionsByEvent[event.id] ?? 0;
                const cap =
                  typeof event.maxTeamEntriesPerClub === "number" &&
                  event.maxTeamEntriesPerClub >= 1
                    ? event.maxTeamEntriesPerClub
                    : null;
                const maxAdd = cap != null ? Math.max(0, cap - existing) : null;
                const atCap = maxAdd != null && maxAdd === 0;
                const previewRaw = existingNames.join(", ");
                const preview =
                  previewRaw.length > 72 ? `${previewRaw.slice(0, 72)}…` : previewRaw || "—";

                return (
                  <div key={event.id} className="px-3 py-2.5 sm:px-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{event.name}</span>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {sexLabel(event.sex)}
                          </Badge>
                          {cap != null ? (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              上限 {cap} 組
                              {atCap ? (
                                <span className="ml-1 font-medium text-amber-800 dark:text-amber-200">
                                  （上限）
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          登録済み{" "}
                          <span className="font-medium tabular-nums text-foreground">{existing}</span> 組
                          {previewRaw ? (
                            <span className="ml-1 truncate" title={previewRaw}>
                              （{preview}）
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground">今回追加</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={atCap || addCount <= 0}
                            onClick={() => setAddCountForEvent(event.id, addCount - 1, maxAdd)}
                            aria-label={`${event.name}の追加組数を1減らす`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
                            {addCount}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={atCap || (maxAdd != null && addCount >= maxAdd)}
                            onClick={() => setAddCountForEvent(event.id, addCount + 1, maxAdd)}
                            aria-label={`${event.name}の追加組数を1増やす`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">メモ（任意・内部用）</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="例: 招待クラブ、特記事項 など"
          className="h-10"
          maxLength={2000}
        />
      </div>

      <Button type="button" className="w-full sm:w-auto" disabled={!canSubmit || submitting} onClick={onSubmit}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            登録中…
          </>
        ) : (
          "チームを追加する"
        )}
      </Button>
    </>
  );
}
