import type { ResultRound } from "@prisma/client";
import type { StartListRoundData } from "@/lib/startListRounds";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";

export type StartListEventPageIndividual = {
  entryId: string;
  userId: string;
  name: string;
  clubId: string | null;
  clubName: string | null;
};

export type StartListEventPageTeam = {
  teamEntryId: string;
  teamName: string;
  clubId: string | null;
  clubName: string | null;
  members: string[];
};

/** スタートリスト表示モード（タブごと・localStorage） */
export type StartListMarshalViewMode = "normal" | "marshal" | "result";

export type StartListEventCardEvent = {
  id: string;
  name: string;
  sex: string;
  type: "INDIVIDUAL" | "TEAM";
  ageCategoryName: string | null;
  preliminaryHeatLaneCount: number | null;
  startListRoundCount: number | null;
  heatPlanConfirmedAtIso: string | null;
  marshalStartedAtIso: string | null;
};

export type StartListEventCardPermissions = {
  canManageStartListOps: boolean;
  isOrgAdmin: boolean;
  showVenueOps: boolean;
};

export type StartListEventParticipantStatusRow = {
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  marshalRound: ResultRound;
  updatedAt: Date;
  calledAt: Date | null;
};

/** 種目スタートリストカード（クライアント）へ渡す props */
export type StartListEventCardProps = {
  viewMode: "public" | "ops";
  competitionId: string;
  competitionName: string;
  archiveRecordedAtIso: string | null;
  event: StartListEventCardEvent;
  initialSettings: unknown;
  defaultMaxLanesPerRace: number | null;
  entryCount: number;
  scheduleLabel: string | null;
  individuals: StartListEventPageIndividual[];
  teams: StartListEventPageTeam[];
  officialRanksByRound: Partial<Record<ResultRound, Record<string, number>>>;
  placementSeed: number;
  frozenSnapshotRounds: StartListRoundData[] | null;
  participantStatusByKey: Record<string, string>;
  initialParticipantStatusRows: StartListEventParticipantStatusRow[];
  initialRoundIndex: number | null;
  roundHeatBarItems: StartListEventBarItem[] | null;
  permissions: StartListEventCardPermissions;
  /** public のみ: SSR 再取得間隔（秒）。15 未満は無効 */
  softRefreshIntervalSec?: number;
};
