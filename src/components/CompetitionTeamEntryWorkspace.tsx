"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import type { ClubTeamAndPrepaidBillingPair } from "@/lib/teamEntryPayments";
import CompetitionTeamEntryManager from "@/components/CompetitionTeamEntryManager";
import TeamEntryHistoryPanel from "@/components/TeamEntryHistoryPanel";

type ClubOption = {
  id: string;
  name: string;
  abbreviation?: string | null;
};

type TeamEvent = {
  id: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  category: "POOL" | "OCEAN";
  maxTeamEntriesPerClub?: number | null;
};

type HistoryEventRow = {
  id: string;
  name: string;
  sex: string | null;
  category: string;
  displayOrder: number;
  ageCategoryDisplayOrder: number | null;
};

type TeamEntryRow = {
  id: string;
  clubId: string;
  eventId: string;
  teamName: string;
  updatedAt: Date;
};

type Props = {
  competitionId: string;
  competitionName: string;
  preferredClubId: string;
  clubs: ClubOption[];
  eventsForHistory: HistoryEventRow[];
  teamEvents: TeamEvent[];
  teamEntries: TeamEntryRow[];
  initialEntriesByClub: Record<string, { id: string; eventId: string; teamName: string }[]>;
  teamEntryFeePerTeam: number;
  entryWindowOpen: boolean;
  billingByClub: Record<string, ClubTeamAndPrepaidBillingPair | undefined>;
  competitionCategory: string | null;
  cardProcessingFeeBps: number;
  clubIndividualEntryBillingTiming: ClubIndividualEntryBillingTiming;
  prepaidMemberOptionsByClub: Record<string, { userId: string; name: string }[]>;
  initialPrepaidIndividualUserIdsByClub: Record<string, string[]>;
};

export default function CompetitionTeamEntryWorkspace({
  competitionId,
  competitionName,
  preferredClubId,
  clubs,
  eventsForHistory,
  teamEvents,
  teamEntries,
  initialEntriesByClub,
  teamEntryFeePerTeam,
  entryWindowOpen,
  billingByClub,
  competitionCategory,
  cardProcessingFeeBps,
  clubIndividualEntryBillingTiming,
  prepaidMemberOptionsByClub,
  initialPrepaidIndividualUserIdsByClub,
}: Props) {
  const [selectedClubId, setSelectedClubId] = useState(() => preferredClubId);
  const [tab, setTab] = useState<"team" | "prepaid">("team");

  useEffect(() => {
    setSelectedClubId(preferredClubId);
  }, [preferredClubId]);

  const selectedClubName = useMemo(
    () => clubs.find((c) => c.id === selectedClubId)?.name ?? "",
    [clubs, selectedClubId]
  );

  const historyEntriesForClub = useMemo(
    () => teamEntries.filter((e) => e.clubId === selectedClubId),
    [teamEntries, selectedClubId]
  );

  const managerCommon = {
    competitionId,
    clubs,
    selectedClubId,
    teamEvents,
    initialEntriesByClub,
    teamEntryFeePerTeam,
    entryWindowOpen,
    billingByClub,
    competitionCategory,
    cardProcessingFeeBps,
    clubIndividualEntryBillingTiming,
    prepaidMemberOptionsByClub,
    initialPrepaidIndividualUserIdsByClub,
  } as const;

  const showManager = tab === "prepaid" || (tab === "team" && entryWindowOpen);
  const managerSurface = tab === "prepaid" ? ("prepaid" as const) : ("team" as const);

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 px-4 py-4 sm:px-5">
        <Label htmlFor="team-entry-club-select" className="text-sm font-medium">
          対象クラブ
        </Label>
        {clubs.length > 1 ? (
          <Select value={selectedClubId} onValueChange={setSelectedClubId}>
            <SelectTrigger id="team-entry-club-select" className="h-11 w-full max-w-md">
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
            id="team-entry-club-select"
            className="flex h-11 w-full max-w-md items-center rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {selectedClubName || "—"}
          </p>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "team" | "prepaid")} className="w-full">
        <div className="border-b border-border/80 bg-muted/30 px-1 py-2.5 sm:px-2">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-lg border border-border/60 bg-background/80 p-1.5 shadow-sm">
            <TabsTrigger
              value="team"
              className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              チーム種目
            </TabsTrigger>
            <TabsTrigger
              value="prepaid"
              className="min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight data-[state=active]:shadow-sm sm:px-3 sm:text-sm"
            >
              クラブによる個人エントリー
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <div className="space-y-6" role="tabpanel">
        {tab === "team" ? (
          <>
            <TeamEntryHistoryPanel
              competitionId={competitionId}
              competitionName={competitionName}
              teamEntryFeePerTeam={teamEntryFeePerTeam}
              clubs={clubs}
              events={eventsForHistory}
              teamEntries={historyEntriesForClub}
              billingByClub={billingByClub}
              viewOnly={!entryWindowOpen}
            />
            {!entryWindowOpen ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">エントリー受付は終了しています</CardTitle>
                  <CardDescription className="text-xs">
                    登録済み内容は上の履歴で確認できます。メンバー割り当てはクラブ詳細配下で続行してください。
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>

      {showManager ? (
        <CompetitionTeamEntryManager {...managerCommon} surface={managerSurface} />
      ) : null}
    </div>
  );
}
