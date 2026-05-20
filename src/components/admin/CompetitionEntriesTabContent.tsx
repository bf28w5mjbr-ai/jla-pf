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
import {
  CSV_EXPORT_SCOPE,
  getActiveCsvExportApproval,
  getPendingCsvExportRequest,
} from "@/lib/competitionEntryCsvExport";
import { getCompetitionEligibilityAgeYears, getJapanCalendarDateParts } from "@/lib/competitionEligibilityAge";
import { getMergedEventIdsFromEntry } from "@/lib/competitionEntryMergedEventIds";
import {
  orderedLabelsForMergedEventIds,
  sortEventsForEntryExport,
} from "@/lib/competitionEntryExportOrdering";
import { isPlayerRegistrationQualificationKind } from "@/lib/qualificationRegistrationKinds";
import { isEntryCheckoutPaidForEligibility } from "@/lib/entryCheckoutSessionPaid";

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

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 日本暦日（Asia/Tokyo）で YYYY-MM-DD */
function formatBirthYmdJp(d: Date): string {
  const { year, month, day } = getJapanCalendarDateParts(d);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function hasApprovedActivePlayerRegistration(
  quals: { kind: string; status: string; expiryDate: Date | null }[]
): boolean {
  const todayYmd = formatBirthYmdJp(new Date());
  return quals.some((q) => {
    if (q.status !== "APPROVED" || !isPlayerRegistrationQualificationKind(q.kind)) return false;
    if (!q.expiryDate) return true;
    return formatBirthYmdJp(q.expiryDate) >= todayYmd;
  });
}

const TEAM_CSV_HEADERS = [
  "エントリー状況",
  "氏名",
  "氏名カナ",
  "性別",
  "生年月日",
  "電話番号",
  "メールアドレス",
  "種目情報",
] as const;

const INDIVIDUAL_CSV_FIXED_HEADERS = [
  "通番号",
  "メンバーID",
  "氏名",
  "フリガナ",
  "所属クラブ",
  "年齢",
  "生年月日",
  "選手登録有無",
] as const;

/** チームエントリー一覧（クラブ・種目ごとのチーム数）用 */
type TeamEntryGroupListRow = {
  key: string;
  rowIndex: number;
  clubName: string;
  eventLabel: string;
  teamCount: number;
};

type IndividualEntryListRow = {
  key: string;
  fullName: string;
  clubName: string;
  eventsLabel: string;
};

type UnpaidIndividualEntryListRow = IndividualEntryListRow & {
  paymentStatusLabel: string;
  attemptedAtLabel: string;
  amountLabel: string;
};

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const formatYen = (amount: number) => yenFormatter.format(amount);

const formatAttemptedAt = (d: Date) =>
  new Date(d).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const unpaidCheckoutStatusLabel = (status: string | null | undefined): string => {
  switch (status) {
    case "PENDING":
      return "未決済";
    case "EXPIRED":
      return "決済期限切れ";
    case "DISPUTE_LOST":
      return "決済無効";
    case undefined:
    case null:
      return "Checkout未作成";
    default:
      return "未決済";
  }
};

function EntriesEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/25 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function TeamEntryGroupsTableDesktop({ rows }: { rows: TeamEntryGroupListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border shadow-sm md:block">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              No.
            </th>
            <th className="min-w-[10rem] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              クラブ名
            </th>
            <th className="min-w-[14rem] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              エントリー種目
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              チーム数
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
              <td className="max-w-[16rem] whitespace-normal px-3 py-2.5 align-top text-xs leading-snug text-foreground">
                {row.clubName}
              </td>
              <td className="px-3 py-2.5 align-top text-xs leading-relaxed text-foreground">{row.eventLabel}</td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right tabular-nums text-foreground">
                {row.teamCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamEntryGroupsCardsMobile({ rows }: { rows: TeamEntryGroupListRow[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
            <span className="text-xs font-medium text-muted-foreground">No. {row.rowIndex}</span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
              チーム {row.teamCount}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{row.clubName}</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground">
            <span className="mb-1 block font-medium text-muted-foreground">エントリー種目</span>
            {row.eventLabel}
          </p>
        </div>
      ))}
    </div>
  );
}

function TeamEntryGroupsResponsive({
  rows,
  emptyMessage,
}: {
  rows: TeamEntryGroupListRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <TeamEntryGroupsCardsMobile rows={rows} />
      <TeamEntryGroupsTableDesktop rows={rows} />
    </>
  );
}

function IndividualEntriesTableDesktop({ rows }: { rows: IndividualEntryListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border shadow-sm md:block">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="min-w-[8rem] whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              氏名
            </th>
            <th className="min-w-[7rem] whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              所属クラブ
            </th>
            <th className="min-w-[14rem] px-3 py-3 text-xs font-semibold text-muted-foreground">出場種目</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border last:border-0 odd:bg-muted/20 hover:bg-muted/40"
            >
              <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium text-foreground">
                {row.fullName}
              </td>
              <td className="max-w-[14rem] whitespace-normal px-3 py-2.5 align-top text-xs leading-snug text-foreground">
                {row.clubName}
              </td>
              <td className="px-3 py-2.5 align-top text-xs leading-relaxed text-foreground">{row.eventsLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndividualEntriesCardsMobile({ rows }: { rows: IndividualEntryListRow[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">{row.fullName}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">所属クラブ</span> {row.clubName}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-foreground">
            <span className="mb-1 block font-medium text-muted-foreground">出場種目</span>
            {row.eventsLabel}
          </p>
        </div>
      ))}
    </div>
  );
}

function IndividualEntriesResponsive({
  rows,
  emptyMessage,
}: {
  rows: IndividualEntryListRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <IndividualEntriesCardsMobile rows={rows} />
      <IndividualEntriesTableDesktop rows={rows} />
    </>
  );
}

function UnpaidIndividualEntriesTableDesktop({ rows }: { rows: UnpaidIndividualEntryListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-amber-200/80 shadow-sm md:block dark:border-amber-900/60">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-amber-200/80 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30">
            <th className="min-w-[8rem] whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              氏名
            </th>
            <th className="min-w-[7rem] whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              所属クラブ
            </th>
            <th className="min-w-[14rem] px-3 py-3 text-xs font-semibold text-muted-foreground">出場種目</th>
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              決済状態
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              申込日時
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold text-muted-foreground">
              金額
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border last:border-0 odd:bg-muted/20 hover:bg-muted/40"
            >
              <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium text-foreground">
                {row.fullName}
              </td>
              <td className="max-w-[14rem] whitespace-normal px-3 py-2.5 align-top text-xs leading-snug text-foreground">
                {row.clubName}
              </td>
              <td className="px-3 py-2.5 align-top text-xs leading-relaxed text-foreground">{row.eventsLabel}</td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs font-medium text-amber-800 dark:text-amber-200">
                {row.paymentStatusLabel}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs tabular-nums text-muted-foreground">
                {row.attemptedAtLabel}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right text-xs tabular-nums text-foreground">
                {row.amountLabel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnpaidIndividualEntriesCardsMobile({ rows }: { rows: UnpaidIndividualEntryListRow[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-amber-200/80 bg-card p-4 shadow-sm dark:border-amber-900/60">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{row.fullName}</p>
            <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              {row.paymentStatusLabel}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">所属クラブ</span> {row.clubName}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-foreground">
            <span className="mb-1 block font-medium text-muted-foreground">出場種目</span>
            {row.eventsLabel}
          </p>
          <div className="mt-3 grid gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground/80">申込日時</span> {row.attemptedAtLabel}
            </p>
            <p>
              <span className="font-medium text-foreground/80">金額</span> {row.amountLabel}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function UnpaidIndividualEntriesResponsive({
  rows,
  emptyMessage,
}: {
  rows: UnpaidIndividualEntryListRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <UnpaidIndividualEntriesCardsMobile rows={rows} />
      <UnpaidIndividualEntriesTableDesktop rows={rows} />
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
      startDate: true,
      ageCategories: {
        select: {
          id: true,
          name: true,
          displayOrder: true,
        },
        orderBy: { displayOrder: "asc" },
      },
      events: {
        select: {
          id: true,
          name: true,
          sex: true,
          type: true,
          requiresEntryTime: true,
          displayOrder: true,
          ageCategoryId: true,
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
      club: { select: { name: true } },
      user: {
        select: {
          email: true,
          profile: {
            select: {
              familyName: true,
              givenName: true,
              familyNameKana: true,
              givenNameKana: true,
              sex: true,
              dateOfBirth: true,
            },
          },
          contact: { select: { phoneNumber: true } },
          jlaProfile: { select: { jlaMemberNumber: true } },
          qualifications: {
            select: { kind: true, status: true, expiryDate: true },
          },
        },
      },
      checkoutSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, payload: true, createdAt: true, amount: true },
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
              email: true,
              profile: {
                select: {
                  familyName: true,
                  givenName: true,
                  familyNameKana: true,
                  givenNameKana: true,
                  sex: true,
                  dateOfBirth: true,
                },
              },
              contact: { select: { phoneNumber: true } },
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

  const programOrderedEvents = sortEventsForEntryExport(
    competition.events,
    competition.ageCategories
  );

  const buildIndividualEventInfo = (entry: (typeof entries)[number]) => {
    const merged = getMergedEventIdsFromEntry(entry);
    const labels = orderedLabelsForMergedEventIds(programOrderedEvents, merged, (id) =>
      formatEventLabel(id)
    );
    return labels.length > 0 ? labels.join(" / ") : "—";
  };

  const isEstablishedIndividualEntry = (entry: (typeof entries)[number]) => {
    if (entry.status === "CANCELLED") return false;
    if (entry.totalFee <= 0) return true;
    if (entry.clubIndividualFeePaidAt) return true;
    return isEntryCheckoutPaidForEligibility(entry.checkoutSessions[0]?.status);
  };

  const isUnpaidIndividualEntryAttempt = (entry: (typeof entries)[number]) => {
    if (entry.status === "CANCELLED") return false;
    if (entry.totalFee <= 0) return false;
    if (entry.clubIndividualFeePaidAt) return false;
    return !isEntryCheckoutPaidForEligibility(entry.checkoutSessions[0]?.status);
  };

  const paidIndividualListRows: IndividualEntryListRow[] = [];
  const unpaidIndividualListRows: UnpaidIndividualEntryListRow[] = [];
  const individualCsvRows: string[][] = [];

  const individualCsvEvents = programOrderedEvents.filter((e) => e.type === "INDIVIDUAL");
  const individualCsvHeaders = [
    ...INDIVIDUAL_CSV_FIXED_HEADERS,
    ...individualCsvEvents.map((e) => formatEventLabel(e.id)),
  ];

  entries.forEach((entry) => {
    const u = entry.user;
    const profile = u.profile;
    const eventsLabel = buildIndividualEventInfo(entry);

    const baseRow = {
      key: entry.id,
      fullName: `${profile?.familyName ?? ""} ${profile?.givenName ?? ""}`.trim(),
      clubName: entry.club?.name ?? "—",
      eventsLabel,
    };

    if (isEstablishedIndividualEntry(entry)) {
      paidIndividualListRows.push(baseRow);
    } else if (isUnpaidIndividualEntryAttempt(entry)) {
      const latestCheckout = entry.checkoutSessions[0];
      unpaidIndividualListRows.push({
        ...baseRow,
        paymentStatusLabel: unpaidCheckoutStatusLabel(latestCheckout?.status),
        attemptedAtLabel: formatAttemptedAt(latestCheckout?.createdAt ?? entry.createdAt),
        amountLabel: formatYen(latestCheckout?.amount ?? entry.totalFee),
      });
      return;
    } else {
      return;
    }

    const mergedEventIds = getMergedEventIdsFromEntry(entry);
    const ageYears = profile?.dateOfBirth
      ? getCompetitionEligibilityAgeYears(profile.dateOfBirth, competition.startDate)
      : 0;
    const playerRegLabel = hasApprovedActivePlayerRegistration(u.qualifications) ? "有" : "無";
    const kanaParts = [profile?.familyNameKana, profile?.givenNameKana].filter(Boolean);
    const kanaDisplay = kanaParts.length > 0 ? kanaParts.join(" ") : "";

    individualCsvRows.push([
      String(individualCsvRows.length + 1),
      u.jlaProfile?.jlaMemberNumber ?? "",
      `${profile?.familyName ?? ""} ${profile?.givenName ?? ""}`.trim(),
      kanaDisplay,
      entry.club?.name ?? "",
      String(ageYears),
      profile?.dateOfBirth ? formatBirthYmdJp(profile.dateOfBirth) : "",
      playerRegLabel,
      ...individualCsvEvents.map((ev) => (mergedEventIds.has(ev.id) ? "○" : "")),
    ]);
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

  const teamEventOrderIndex = new Map(
    programOrderedEvents.filter((e) => e.type === "TEAM").map((e, i) => [e.id, i] as const)
  );

  type TeamGroupAgg = { clubId: string; clubName: string; eventId: string; count: number };
  const teamGroupMap = new Map<string, TeamGroupAgg>();
  for (const te of teamEntries) {
    const gk = `${te.clubId}:${te.eventId}`;
    const cur = teamGroupMap.get(gk);
    if (cur) {
      cur.count += 1;
    } else {
      teamGroupMap.set(gk, {
        clubId: te.clubId,
        clubName: te.club.name,
        eventId: te.eventId,
        count: 1,
      });
    }
  }

  const teamGroupListRows: TeamEntryGroupListRow[] = [...teamGroupMap.values()]
    .sort((a, b) => {
      const nameCmp = a.clubName.localeCompare(b.clubName, "ja");
      if (nameCmp !== 0) return nameCmp;
      const ia = teamEventOrderIndex.get(a.eventId) ?? 9999;
      const ib = teamEventOrderIndex.get(b.eventId) ?? 9999;
      if (ia !== ib) return ia - ib;
      return a.eventId.localeCompare(b.eventId);
    })
    .map((g, i) => ({
      key: `${g.clubId}:${g.eventId}`,
      rowIndex: i + 1,
      clubName: g.clubName,
      eventLabel: formatEventLabel(g.eventId),
      teamCount: g.count,
    }));

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

  teamEntries.forEach((te) => {
    const eventInfoBase = `${formatEventLabel(te.eventId, te.event)} / チーム: ${te.teamName}（${te.club.name}）`;
    const statusLabel = clubPaymentLabel(te.clubId);

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
      const profile = u.profile;
      teamRowsForExport.push({
        statusLabel,
        name: `${profile?.familyName ?? ""} ${profile?.givenName ?? ""}`.trim(),
        nameKana: `${profile?.familyNameKana ?? ""} ${profile?.givenNameKana ?? ""}`.trim(),
        sex: sexLabel(profile?.sex ?? ""),
        birth: profile?.dateOfBirth ? formatBirthDate(profile.dateOfBirth) : "",
        phone: u.contact?.phoneNumber ?? "",
        email: u.email,
        eventInfo: eventInfoBase,
      });
    }
  });

  const teamCsvRows = teamRowsForExport.map((r) => [
    r.statusLabel,
    r.name,
    r.nameKana,
    r.sex,
    r.birth,
    r.phone,
    r.email,
    r.eventInfo,
  ]);

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
                氏名・所属クラブ・出場種目を一覧表示します。メンバーIDや決済状況などの詳細は、PF管理者承認後にダウンロードできるCSVで確認できます。
                出場種目の並び（一覧・CSVの種目列）は、
                <span className="font-medium text-foreground/90"> 年齢カテゴリの表示順 </span>
                でまとまり、同一カテゴリ内は種目の表示順です（カテゴリの並びが同順のときはカテゴリ名の順）。種目は正しい年齢カテゴリに紐づけてください。
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <CompetitionEntryCsvExportControls
                competitionId={competition.id}
                scope={CSV_EXPORT_SCOPE.INDIVIDUAL}
                csvHeaders={individualCsvHeaders}
                csvRows={individualCsvRows}
                fileNameBase={`${exportNameBase}_個人エントリー`}
                hasPending={!!individualPending}
                hasActiveApproval={!!individualApproval}
              />
              <div className="flex items-baseline gap-2 rounded-xl border border-border bg-background px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">件数</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {paidIndividualListRows.length}
                </span>
                <span className="text-sm text-muted-foreground">件</span>
              </div>
              {unpaidIndividualListRows.length > 0 ? (
                <div className="flex items-baseline gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-100">未決済</span>
                  <span className="text-xl font-semibold tabular-nums tracking-tight text-amber-900 dark:text-amber-100">
                    {unpaidIndividualListRows.length}
                  </span>
                  <span className="text-sm text-amber-800 dark:text-amber-200">件</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <IndividualEntriesResponsive
            rows={paidIndividualListRows}
            emptyMessage="個人エントリーはまだありません。"
          />
          <div className="border-t border-border pt-5">
            <section className="space-y-3" aria-labelledby="unpaid-individual-entries-title">
              <div className="space-y-1">
                <h3 id="unpaid-individual-entries-title" className="text-sm font-semibold text-foreground">
                  未決済のエントリー試行
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  エントリー手続きは開始されていますが、参加費の決済が成立していないため出場者一覧・CSVには含めません。
                </p>
              </div>
              <UnpaidIndividualEntriesResponsive
                rows={unpaidIndividualListRows}
                emptyMessage="未決済のエントリー試行はありません。"
              />
            </section>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="space-y-3 border-b border-border bg-muted/20 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">チームエントリー</CardTitle>
              <CardDescription className="text-sm">
                画面上はクラブ・種目ごとのチーム数です。メンバー氏名・連絡先・決済状況などの詳細はCSVに含まれます（承認後にダウンロード）。
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <CompetitionEntryCsvExportControls
                competitionId={competition.id}
                scope={CSV_EXPORT_SCOPE.TEAM}
                csvHeaders={[...TEAM_CSV_HEADERS]}
                csvRows={teamCsvRows}
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
          <TeamEntryGroupsResponsive
            rows={teamGroupListRows}
            emptyMessage="チームエントリーはまだありません。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
