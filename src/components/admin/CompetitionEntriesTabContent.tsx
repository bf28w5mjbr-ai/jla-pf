import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db";
import CompetitionHostInviteEntryPanel from "@/components/admin/CompetitionHostInviteEntryPanel";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
  getTeamPaymentStatusLabel,
} from "@/lib/teamEntryPayments";
import CompetitionEntryCsvExportControls from "@/components/admin/CompetitionEntryCsvExportControls";
import type { EntryExportRow } from "@/components/admin/CompetitionEntriesSpreadsheetExportButton";
import {
  CSV_EXPORT_SCOPE,
  getActiveCsvExportApproval,
  getPendingCsvExportRequest,
} from "@/lib/competitionEntryCsvExport";
import {
  buildAdminIndividualEntryStatusLabel,
  getIndividualEventIdsFromEntry,
} from "@/lib/entryWithdrawalAdminLabel";

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
};

const sexLabel = (sex: string) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

const formatBirthDate = (d: Date) =>
  new Date(d).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** 画面上は氏名・連絡先を出さない（CSVは従来どおりフル項目） */
type EntryMinimalRow = {
  key: string;
  rowIndex: number;
  statusLabel: string;
  eventInfo: string;
};

function registrationSourceFromSnapshot(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const s = data as Record<string, unknown>;
  return typeof s.registrationSource === "string" ? s.registrationSource : undefined;
}

function EntriesEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/25 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function EntriesMinimalTableDesktop({ rows }: { rows: EntryMinimalRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border shadow-sm md:block">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              No.
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              状況
            </th>
            <th className="min-w-[240px] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              種目・概要
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border last:border-0 odd:bg-muted/20 hover:bg-muted/40"
            >
              <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums text-muted-foreground">
                {row.rowIndex}
              </td>
              <td className="max-w-[16rem] whitespace-normal px-3 py-2.5 align-top text-xs leading-snug">
                {row.statusLabel}
              </td>
              <td className="px-3 py-2.5 align-top text-xs leading-relaxed">{row.eventInfo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntriesMinimalCardsMobile({ rows }: { rows: EntryMinimalRow[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
            <span className="text-xs font-medium text-muted-foreground">No. {row.rowIndex}</span>
            <span className="max-w-[70%] shrink-0 rounded-md bg-muted px-2 py-1 text-right text-[10px] font-medium leading-tight text-muted-foreground">
              {row.statusLabel}
            </span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-foreground">{row.eventInfo}</p>
        </div>
      ))}
    </div>
  );
}

function EntriesMinimalResponsive({
  rows,
  emptyMessage,
}: {
  rows: EntryMinimalRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <EntriesMinimalCardsMobile rows={rows} />
      <EntriesMinimalTableDesktop rows={rows} />
    </>
  );
}

export default async function CompetitionEntriesTabContent({
  organizationId,
  competitionId,
  canEdit,
}: Props) {
  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>エントリー状況</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          このタブは主催団体管理者のみ閲覧できます。
        </CardContent>
      </Card>
    );
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      events: {
        select: {
          id: true,
          name: true,
          sex: true,
          type: true,
          requiresEntryTime: true,
        },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  if (!competition || competition.organizationId !== organizationId) {
    notFound();
  }

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId: competition.id },
    include: {
      user: {
        select: {
          familyName: true,
          givenName: true,
          familyNameKana: true,
          givenNameKana: true,
          sex: true,
          dateOfBirth: true,
          phoneNumber: true,
          email: true,
        },
      },
      checkoutSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, payload: true },
      },
      items: {
        select: { eventId: true },
      },
      snapshot: { select: { data: true } },
      participantStatuses: {
        select: { eventId: true, status: true, reason: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const teamEntries = await prisma.teamEntry.findMany({
    where: { competitionId: competition.id },
    include: {
      event: {
        select: { id: true, name: true, sex: true },
      },
      club: {
        select: { name: true },
      },
      members: {
        include: {
          user: {
            select: {
              familyName: true,
              givenName: true,
              familyNameKana: true,
              givenNameKana: true,
              sex: true,
              dateOfBirth: true,
              phoneNumber: true,
              email: true,
            },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const [individualApproval, teamApproval, individualPending, teamPending] = await Promise.all([
    getActiveCsvExportApproval(competition.id, CSV_EXPORT_SCOPE.INDIVIDUAL),
    getActiveCsvExportApproval(competition.id, CSV_EXPORT_SCOPE.TEAM),
    getPendingCsvExportRequest(competition.id, CSV_EXPORT_SCOPE.INDIVIDUAL),
    getPendingCsvExportRequest(competition.id, CSV_EXPORT_SCOPE.TEAM),
  ]);

  const eventMap = new Map(competition.events.map((e) => [e.id, e] as const));

  const formatEventLabel = (eventId: string | undefined, fallbackEvent?: { name: string; sex: string }) => {
    const event = eventId ? eventMap.get(eventId) : fallbackEvent;
    if (!event) return "種目不明";
    return `${event.name}（${sexLabel(event.sex)}）`;
  };

  const buildIndividualEventInfo = (entry: (typeof entries)[number]) => {
    const snapshot = entry.snapshot?.data as
      | {
          items?: { eventId?: string }[];
          teamEntries?: { eventId?: string }[];
        }
      | undefined;
    const individualItems = Array.isArray(snapshot?.items)
      ? snapshot.items
      : entry.items.map((item) => ({ eventId: item.eventId }));
    const teamItems = Array.isArray(snapshot?.teamEntries) ? snapshot.teamEntries : [];
    const labels = [
      ...individualItems.map((item) => formatEventLabel(item.eventId)),
      ...teamItems.map((item) => formatEventLabel(item.eventId)),
    ];
    return labels.length > 0 ? labels.join(" / ") : "—";
  };

  const individualRowsMinimal: EntryMinimalRow[] = [];
  const individualRowsForExport: {
    statusLabel: string;
    name: string;
    nameKana: string;
    sex: string;
    birth: string;
    phone: string;
    email: string;
    eventInfo: string;
  }[] = [];

  entries.forEach((entry, i) => {
    const u = entry.user;
    const baseStatus = buildAdminIndividualEntryStatusLabel({
      entry,
      entryEventIds: getIndividualEventIdsFromEntry(entry),
      participantStatuses: entry.participantStatuses,
    });
    const regSrc = registrationSourceFromSnapshot(entry.snapshot?.data);
    const statusLabel =
      regSrc === "HOST_INVITE" ? `主催招待 / ${baseStatus}` : baseStatus;
    const eventInfo = buildIndividualEventInfo(entry);

    individualRowsMinimal.push({
      key: entry.id,
      rowIndex: i + 1,
      statusLabel,
      eventInfo,
    });

    individualRowsForExport.push({
      statusLabel,
      name: `${u.familyName} ${u.givenName}`,
      nameKana: `${u.familyNameKana} ${u.givenNameKana}`,
      sex: sexLabel(u.sex),
      birth: formatBirthDate(u.dateOfBirth),
      phone: u.phoneNumber,
      email: u.email,
      eventInfo,
    });
  });

  const clubIds = [...new Set(teamEntries.map((t) => t.clubId))];
  const teamAndPrepaidOwnerIds = clubIds.flatMap((cid) => [
    buildTeamEntryPaymentOwnerId(competition.id, cid),
    buildClubPrepaidIndividualPaymentOwnerId(competition.id, cid),
  ]);
  const teamPayments =
    teamAndPrepaidOwnerIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            ownerType: "CLUB",
            ownerId: { in: teamAndPrepaidOwnerIds },
            type: "COMPETITION_ENTRY_FEE",
          },
          select: {
            ownerId: true,
            status: true,
            amount: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        })
      : [];

  const latestPaymentByOwnerId = new Map<string, string | null>();
  const latestAmountByOwnerId = new Map<string, number>();
  for (const p of teamPayments) {
    if (!latestPaymentByOwnerId.has(p.ownerId)) {
      latestPaymentByOwnerId.set(p.ownerId, p.status);
      latestAmountByOwnerId.set(p.ownerId, p.amount);
    }
  }

  const clubPaymentLabel = (clubId: string) => {
    const teamOid = buildTeamEntryPaymentOwnerId(competition.id, clubId);
    const prepaidOid = buildClubPrepaidIndividualPaymentOwnerId(competition.id, clubId);
    const teamStatus = latestPaymentByOwnerId.get(teamOid) ?? null;
    const prepaidStatus = latestPaymentByOwnerId.get(prepaidOid) ?? null;
    const prepaidAmt = latestAmountByOwnerId.get(prepaidOid) ?? 0;
    const parts = [`チーム: ${getTeamPaymentStatusLabel(teamStatus)}`];
    if (prepaidAmt > 0) {
      parts.push(`個人枠: ${getTeamPaymentStatusLabel(prepaidStatus)}`);
    }
    return `クラブ請求: ${parts.join(" / ")}`;
  };

  const teamRowsMinimal: EntryMinimalRow[] = [];
  const teamRowsForExport: {
    statusLabel: string;
    name: string;
    nameKana: string;
    sex: string;
    birth: string;
    phone: string;
    email: string;
    eventInfo: string;
  }[] = [];

  teamEntries.forEach((te, ti) => {
    const eventInfoBase = `${formatEventLabel(te.eventId, te.event)} / チーム: ${te.teamName}（${te.club.name}）`;
    const statusLabel = clubPaymentLabel(te.clubId);

    teamRowsMinimal.push({
      key: te.id,
      rowIndex: ti + 1,
      statusLabel,
      eventInfo: eventInfoBase,
    });

    if (te.members.length === 0) {
      teamRowsForExport.push({
        statusLabel,
        name: te.teamName,
        nameKana: "—",
        sex: "—",
        birth: "—",
        phone: "—",
        email: "—",
        eventInfo: eventInfoBase,
      });
      return;
    }

    for (const m of te.members) {
      const u = m.user;
      teamRowsForExport.push({
        statusLabel,
        name: `${u.familyName} ${u.givenName}`,
        nameKana: `${u.familyNameKana} ${u.givenNameKana}`,
        sex: sexLabel(u.sex),
        birth: formatBirthDate(u.dateOfBirth),
        phone: u.phoneNumber,
        email: u.email,
        eventInfo: eventInfoBase,
      });
    }
  });

  const toExportRow = (row: (typeof individualRowsForExport)[number]): EntryExportRow => ({
    statusLabel: row.statusLabel,
    name: row.name,
    nameKana: row.nameKana,
    sex: row.sex,
    birth: row.birth,
    phone: row.phone,
    email: row.email,
    eventInfo: row.eventInfo,
  });

  const individualExportRows = individualRowsForExport.map(toExportRow);
  const teamExportRows = teamRowsForExport.map(toExportRow);
  const exportNameBase = competition.name.replace(/[\\/:*?"<>|]/g, "_").trim() || competition.id;

  const teamEntryCount = teamEntries.length;

  const individualEventOptions = competition.events
    .filter((e) => e.type === "INDIVIDUAL")
    .map((e) => ({
      id: e.id,
      name: e.name,
      sex: e.sex,
      requiresEntryTime: e.requiresEntryTime,
    }));

  return (
    <div className="min-w-0 space-y-8">
      <CompetitionHostInviteEntryPanel
        competitionId={competitionId}
        individualEvents={individualEventOptions}
      />

      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="space-y-3 border-b border-border bg-muted/20 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">個人エントリー</CardTitle>
              <CardDescription className="text-sm">
                画面上は状況と種目のみ表示します（氏名・連絡先はCSVで取得）。CSVはPF管理者の承認後にダウンロードできます。
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <CompetitionEntryCsvExportControls
                competitionId={competition.id}
                scope={CSV_EXPORT_SCOPE.INDIVIDUAL}
                rows={individualExportRows}
                fileNameBase={`${exportNameBase}_個人エントリー`}
                hasPending={!!individualPending}
                hasActiveApproval={!!individualApproval}
              />
              <div className="flex items-baseline gap-2 rounded-xl border border-border bg-background px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">件数</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {individualRowsMinimal.length}
                </span>
                <span className="text-sm text-muted-foreground">件</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <EntriesMinimalResponsive
            rows={individualRowsMinimal}
            emptyMessage="個人エントリーはまだありません。"
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="space-y-3 border-b border-border bg-muted/20 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">チームエントリー</CardTitle>
              <CardDescription className="text-sm">
                画面上はチーム単位の概要のみです。メンバー氏名・連絡先はCSVに含まれます（承認後にダウンロード）。
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <CompetitionEntryCsvExportControls
                competitionId={competition.id}
                scope={CSV_EXPORT_SCOPE.TEAM}
                rows={teamExportRows}
                fileNameBase={`${exportNameBase}_チームエントリー`}
                hasPending={!!teamPending}
                hasActiveApproval={!!teamApproval}
              />
              <div className="flex items-baseline gap-2 rounded-xl border border-border bg-background px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">チーム数</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {teamEntryCount}
                </span>
                <span className="text-sm text-muted-foreground">件</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <EntriesMinimalResponsive
            rows={teamRowsMinimal}
            emptyMessage="チームエントリーはまだありません。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
