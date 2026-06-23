import { notFound } from "next/navigation";
import { AlertCircle, Clock } from "lucide-react";
import { OrgEditorialPanel } from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";
import CompetitionHostInviteEntryPanel from "@/components/admin/CompetitionHostInviteEntryPanel";
import CompetitionEntriesSummaryPanel from "@/components/admin/CompetitionEntriesSummaryPanel";
import {
  EntriesCountBadge,
  EntriesIconBadge,
  EntriesSectionBlock,
} from "@/components/admin/competitionEntriesTabUi";
import { prisma } from "@/server/db";
import CompetitionEntryPostPayActions from "@/components/admin/CompetitionEntryPostPayActions";
import CompetitionUnpaidIntentBulkMailPanel from "@/components/admin/CompetitionUnpaidIntentBulkMailPanel";
import { listUnpaidIntentEmailTargets } from "@/lib/entryPaymentIntent";
import {
  buildClubPrepaidIndividualPaymentOwnerId,
  buildTeamEntryPaymentOwnerId,
  getTeamPaymentStatusLabel,
} from "@/lib/teamEntryPayments";
import {
  CSV_EXPORT_SCOPE,
  getActiveCsvExportApproval,
  getPendingCsvExportRequest,
} from "@/lib/competitionEntryCsvExport";
import { getCompetitionEligibilityAgeYears, getJapanCalendarDateParts } from "@/lib/competitionEligibilityAge";
import {
  orderedLabelsForMergedEventIds,
  sortEventsForEntryExport,
} from "@/lib/competitionEntryExportOrdering";
import { isEntryEstablished } from "@/lib/entryFinalization";
import {
  hasOrganizerPostPayApproval,
  isEntryFeeSettled,
} from "@/lib/entryOrganizerPostPay";
import { pickAgeCategoryIdForBirthDate } from "@/lib/competitionEntryAgeTiered";
import { resolveAgeCategoriesForEntrySummaryCount } from "@/lib/competitionEntrySummaryAgeCategoryOverrides";
import { isPlayerRegistrationQualificationKind } from "@/lib/qualificationRegistrationKinds";
import {
  buildIndividualEventCircleCells,
  getLiveIndividualEventIdsFromEntry,
  shouldHideTeamEntryFromStartListAlignment,
} from "@/lib/startListEntryAlignment";
import {
  EntriesEmpty,
  type IndividualEntryListRow,
  type TeamEntryGroupListRow,
} from "@/components/admin/competitionEntriesListViews";

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

type UnpaidIndividualEntryListRow = IndividualEntryListRow & {
  entryId: string;
  paymentStatusLabel: string;
  attemptedAtLabel: string;
  amountLabel: string;
};

type PostPayPendingEntryListRow = IndividualEntryListRow & {
  entryId: string;
  amountLabel: string;
  approvedAtLabel: string;
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

function UnpaidIndividualEntriesTableDesktop({ rows }: { rows: UnpaidIndividualEntryListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-amber-200/80 shadow-sm md:block dark:border-amber-900/60">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
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

function UnpaidIndividualEntriesRescuePanel({
  competitionId,
  rows,
}: {
  competitionId: string;
  rows: UnpaidIndividualEntryListRow[];
}) {
  return (
    <details className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-foreground">
        救済（通常は不要）
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        通常は上の「未決済者への出場意思確認メール」で対応してください。メール未達や電話対応などで個別に後払い承認が必要な場合のみ使います。
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
          >
            <span className="font-medium text-foreground">{row.fullName}</span>
            <CompetitionEntryPostPayActions
              competitionId={competitionId}
              entryId={row.entryId}
              mode="approve"
              fullName={row.fullName}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

function UnpaidIndividualEntriesResponsive({
  competitionId,
  rows,
  emptyMessage,
}: {
  competitionId: string;
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
      <UnpaidIndividualEntriesRescuePanel competitionId={competitionId} rows={rows} />
    </>
  );
}

function PostPayPendingEntriesTableDesktop({
  competitionId,
  rows,
}: {
  competitionId: string;
  rows: PostPayPendingEntryListRow[];
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-emerald-200/80 shadow-sm md:block dark:border-emerald-900/60">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <th className="min-w-[8rem] px-3 py-3 text-xs font-semibold text-muted-foreground">氏名</th>
            <th className="min-w-[7rem] px-3 py-3 text-xs font-semibold text-muted-foreground">所属クラブ</th>
            <th className="min-w-[14rem] px-3 py-3 text-xs font-semibold text-muted-foreground">出場種目</th>
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">承認日時</th>
            <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold text-muted-foreground">金額</th>
            <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0 odd:bg-muted/20">
              <td className="px-3 py-2.5 font-medium">{row.fullName}</td>
              <td className="px-3 py-2.5 text-xs">{row.clubName}</td>
              <td className="px-3 py-2.5 text-xs">{row.eventsLabel}</td>
              <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{row.approvedAtLabel}</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">{row.amountLabel}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap justify-end gap-2">
                  <CompetitionEntryPostPayActions
                    competitionId={competitionId}
                    entryId={row.entryId}
                    mode="manual"
                    fullName={row.fullName}
                  />
                  <CompetitionEntryPostPayActions
                    competitionId={competitionId}
                    entryId={row.entryId}
                    mode="revoke"
                    fullName={row.fullName}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostPayPendingEntriesCardsMobile({
  competitionId,
  rows,
}: {
  competitionId: string;
  rows: PostPayPendingEntryListRow[];
}) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div
          key={row.key}
          className="rounded-xl border border-emerald-200/80 bg-card p-4 shadow-sm dark:border-emerald-900/60"
        >
          <p className="text-sm font-semibold">{row.fullName}</p>
          <p className="mt-1 text-xs text-muted-foreground">所属: {row.clubName}</p>
          <p className="mt-2 text-xs">{row.eventsLabel}</p>
          <p className="mt-2 text-xs text-muted-foreground">承認: {row.approvedAtLabel}</p>
          <p className="mt-1 text-xs">金額: {row.amountLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <CompetitionEntryPostPayActions
              competitionId={competitionId}
              entryId={row.entryId}
              mode="manual"
              fullName={row.fullName}
            />
            <CompetitionEntryPostPayActions
              competitionId={competitionId}
              entryId={row.entryId}
              mode="revoke"
              fullName={row.fullName}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PostPayPendingEntriesResponsive({
  competitionId,
  rows,
  emptyMessage,
}: {
  competitionId: string;
  rows: PostPayPendingEntryListRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <PostPayPendingEntriesCardsMobile competitionId={competitionId} rows={rows} />
      <PostPayPendingEntriesTableDesktop competitionId={competitionId} rows={rows} />
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
      <OrgEditorialPanel accent="muted">
        <h3 className="text-base font-semibold text-foreground">エントリー状況</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          このタブは主催団体管理者のみ閲覧できます。
        </p>
      </OrgEditorialPanel>
    );
  }

  const [
    competition,
    entries,
    teamEntries,
    individualApproval,
    teamApproval,
    individualPending,
    teamPending,
  ] = await Promise.all([
    prisma.competition.findUnique({
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
            eligibleBirthDateFrom: true,
            eligibleBirthDateTo: true,
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
            maxTeamEntriesPerClub: true,
            displayOrder: true,
            ageCategoryId: true,
          },
          orderBy: { displayOrder: "asc" },
        },
      },
    }),
    prisma.competitionEntry.findMany({
      where: { competitionId },
      select: {
        id: true,
        status: true,
        totalFee: true,
        clubIndividualFeePaidAt: true,
        organizerPostPayApprovedAt: true,
        organizerManualPaidAt: true,
        createdAt: true,
        clubId: true,
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
          take: 15,
          select: { status: true, createdAt: true, amount: true },
        },
        items: {
          select: { eventId: true },
        },
        participantStatuses: {
          select: {
            eventId: true,
            status: true,
            reason: true,
            participantType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teamEntry.findMany({
      where: { competitionId },
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
        participantStatuses: {
          select: {
            eventId: true,
            status: true,
            reason: true,
            participantType: true,
            teamEntryId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    getActiveCsvExportApproval(competitionId, CSV_EXPORT_SCOPE.INDIVIDUAL),
    getActiveCsvExportApproval(competitionId, CSV_EXPORT_SCOPE.TEAM),
    getPendingCsvExportRequest(competitionId, CSV_EXPORT_SCOPE.INDIVIDUAL),
    getPendingCsvExportRequest(competitionId, CSV_EXPORT_SCOPE.TEAM),
  ]);

  if (!competition || competition.organizationId !== organizationId) {
    notFound();
  }

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

  const entryEstablishedInput = (entry: (typeof entries)[number]) => ({
    status: entry.status,
    totalFee: entry.totalFee,
    clubIndividualFeePaidAt: entry.clubIndividualFeePaidAt,
    organizerPostPayApprovedAt: entry.organizerPostPayApprovedAt,
    organizerManualPaidAt: entry.organizerManualPaidAt,
    checkoutSessions: entry.checkoutSessions.map((s) => ({ status: s.status })),
  });

  const buildIndividualEventInfo = (entry: (typeof entries)[number]) => {
    const liveIds = new Set(getLiveIndividualEventIdsFromEntry(entry.items));
    const labels = orderedLabelsForMergedEventIds(programOrderedEvents, liveIds, (id) =>
      formatEventLabel(id)
    );
    return labels.length > 0 ? labels.join(" / ") : "—";
  };

  const isUnpaidIndividualEntryAttempt = (entry: (typeof entries)[number]) => {
    if (entry.status === "CANCELLED") return false;
    if (isEntryEstablished(entryEstablishedInput(entry))) return false;
    return entry.totalFee > 0;
  };

  const paidIndividualListRows: IndividualEntryListRow[] = [];
  const unpaidIndividualListRows: UnpaidIndividualEntryListRow[] = [];
  const postPayPendingListRows: PostPayPendingEntryListRow[] = [];
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

    const establishedInput = entryEstablishedInput(entry);
    const established = isEntryEstablished(establishedInput);

    if (
      established &&
      hasOrganizerPostPayApproval(entry) &&
      !isEntryFeeSettled(establishedInput)
    ) {
      postPayPendingListRows.push({
        ...baseRow,
        entryId: entry.id,
        amountLabel: formatYen(entry.totalFee),
        approvedAtLabel: entry.organizerPostPayApprovedAt
          ? formatAttemptedAt(entry.organizerPostPayApprovedAt)
          : "—",
      });
    }

    if (isUnpaidIndividualEntryAttempt(entry)) {
      const latestCheckout = entry.checkoutSessions[0];
      unpaidIndividualListRows.push({
        ...baseRow,
        entryId: entry.id,
        paymentStatusLabel: unpaidCheckoutStatusLabel(latestCheckout?.status),
        attemptedAtLabel: formatAttemptedAt(latestCheckout?.createdAt ?? entry.createdAt),
        amountLabel: formatYen(latestCheckout?.amount ?? entry.totalFee),
      });
      return;
    }

    if (!established) {
      return;
    }

    paidIndividualListRows.push(baseRow);

    const liveEventIds = new Set(getLiveIndividualEventIdsFromEntry(entry.items));
    const alignmentStatuses = entry.participantStatuses.map((row) => ({
      eventId: row.eventId,
      status: row.status,
      reason: row.reason,
      participantType: row.participantType,
    }));
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
      ...buildIndividualEventCircleCells(
        individualCsvEvents.map((ev) => ev.id),
        liveEventIds,
        alignmentStatuses
      ),
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
    if (
      shouldHideTeamEntryFromStartListAlignment(te.id, te.eventId, te.participantStatuses)
    ) {
      continue;
    }
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
    if (
      shouldHideTeamEntryFromStartListAlignment(te.id, te.eventId, te.participantStatuses)
    ) {
      return;
    }
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

  const teamEntryCount = teamEntries.filter(
    (te) =>
      !shouldHideTeamEntryFromStartListAlignment(te.id, te.eventId, te.participantStatuses)
  ).length;

  const individualEntryCount = paidIndividualListRows.length;

  const ageCategoriesForSummaryCount = resolveAgeCategoriesForEntrySummaryCount(
    competitionId,
    competition.ageCategories
  );

  const ageCategoryCountById = new Map<string, number>(
    competition.ageCategories.map((c) => [c.id, 0])
  );
  let ageCategoryUncategorizedCount = 0;
  if (competition.ageCategories.length > 0) {
    for (const entry of entries) {
      if (!isEntryEstablished(entryEstablishedInput(entry))) continue;
      const dob = entry.user.profile?.dateOfBirth;
      if (!dob) {
        ageCategoryUncategorizedCount += 1;
        continue;
      }
      const catId = pickAgeCategoryIdForBirthDate(ageCategoriesForSummaryCount, new Date(dob));
      if (!catId) {
        ageCategoryUncategorizedCount += 1;
        continue;
      }
      ageCategoryCountById.set(catId, (ageCategoryCountById.get(catId) ?? 0) + 1);
    }
  }

  const ageCategoryCounts =
    competition.ageCategories.length > 0
      ? competition.ageCategories.map((c) => ({
          id: c.id,
          name: c.name,
          count: ageCategoryCountById.get(c.id) ?? 0,
        }))
      : null;

  const entryClubIds = new Set<string>();
  for (const te of teamEntries) {
    if (shouldHideTeamEntryFromStartListAlignment(te.id, te.eventId, te.participantStatuses)) {
      continue;
    }
    entryClubIds.add(te.clubId);
  }
  for (const entry of entries) {
    if (!isEntryEstablished(entryEstablishedInput(entry))) continue;
    if (entry.clubId) entryClubIds.add(entry.clubId);
  }
  const entryClubCount = entryClubIds.size > 0 ? entryClubIds.size : null;

  const individualEventOptions = competition.events
    .filter((e) => e.type === "INDIVIDUAL")
    .map((e) => ({
      id: e.id,
      name: e.name,
      sex: e.sex,
      requiresEntryTime: e.requiresEntryTime,
    }));

  const teamEventOptions = competition.events
    .filter((e) => e.type === "TEAM")
    .map((e) => ({
      id: e.id,
      name: e.name,
      sex: e.sex,
      maxTeamEntriesPerClub: e.maxTeamEntriesPerClub,
    }));

  const [latestIntentCampaign, unpaidIntentTargets] = await Promise.all([
    prisma.competitionUnpaidEntryIntentCampaign.findFirst({
      where: { competitionId: competition.id },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        sentAt: true,
        responseDeadlineAt: true,
        tokens: {
          select: {
            entryId: true,
            choice: true,
            respondedAt: true,
            deadlineDnsAppliedAt: true,
            emailDeliveredAt: true,
          },
        },
      },
    }),
    listUnpaidIntentEmailTargets(prisma, competition.id),
  ]);

  const unpaidIntentTargetEntryIds = new Set(
    unpaidIntentTargets.targets.map((t) => t.entryId)
  );

  const initialIntentCampaign = latestIntentCampaign
    ? (() => {
        const tokens = latestIntentCampaign.tokens;
        const tokenPendingCount = tokens.filter(
          (t) => t.respondedAt == null && t.deadlineDnsAppliedAt == null
        ).length;
        const actionRequiredCount = tokens.filter(
          (t) =>
            t.respondedAt == null &&
            t.deadlineDnsAppliedAt == null &&
            unpaidIntentTargetEntryIds.has(t.entryId)
        ).length;
        const emailUndeliveredCount = tokens.filter((t) => t.emailDeliveredAt == null).length;
        return {
          id: latestIntentCampaign.id,
          sentAt: latestIntentCampaign.sentAt.toISOString(),
          responseDeadlineAt: latestIntentCampaign.responseDeadlineAt.toISOString(),
          totalTokens: tokens.length,
          participateCount: tokens.filter((t) => t.choice === "PARTICIPATE").length,
          withdrawCount: tokens.filter((t) => t.choice === "WITHDRAW").length,
          deadlineDnsCount: tokens.filter((t) => t.deadlineDnsAppliedAt != null).length,
          pendingCount: tokenPendingCount,
          actionRequiredCount,
          emailDeliveredCount: tokens.filter((t) => t.emailDeliveredAt != null).length,
          emailUndeliveredCount,
          currentUnpaidTargetCount: unpaidIntentTargets.targets.length,
        };
      })()
    : null;

  return (
    <div className="min-w-0 space-y-8 pb-2">
      <EntriesSectionBlock label="Overview">
        <CompetitionEntriesSummaryPanel
        competitionId={competition.id}
        individualEntryCount={individualEntryCount}
        teamEntryCount={teamEntryCount}
        entryClubCount={entryClubCount}
        ageCategoryCounts={ageCategoryCounts}
        ageCategoryUncategorizedCount={ageCategoryUncategorizedCount}
        paidIndividualRows={paidIndividualListRows}
        teamGroupRows={teamGroupListRows}
        individualCsv={{
          headers: individualCsvHeaders,
          rows: individualCsvRows,
          fileNameBase: `${exportNameBase}_個人エントリー`,
          hasPending: !!individualPending,
          hasActiveApproval: !!individualApproval,
        }}
        teamCsv={{
          headers: [...TEAM_CSV_HEADERS],
          rows: teamCsvRows,
          fileNameBase: `${exportNameBase}_チームエントリー`,
          hasPending: !!teamPending,
          hasActiveApproval: !!teamApproval,
        }}
        />
      </EntriesSectionBlock>

      <EntriesSectionBlock label="Operations">
        <CompetitionUnpaidIntentBulkMailPanel
        competitionId={competitionId}
        initialCampaign={initialIntentCampaign}
      />

        <OrgEditorialPanel accent="orange" className="!px-4 !py-4 sm:!px-5 sm:!py-5">
          <div className="mb-5">
            <h3 className="text-base font-semibold tracking-tight text-foreground">要対応エントリー</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              未決済の試行や後払い入金待ちなど、主催側の対応が必要なエントリーです。
            </p>
          </div>
          <div className="space-y-5">
            <section className="space-y-3" aria-labelledby="unpaid-individual-entries-title">
              <div className="flex flex-wrap items-start gap-3">
                <EntriesIconBadge tone="amber">
                  <AlertCircle className="size-4" strokeWidth={1.75} aria-hidden />
                </EntriesIconBadge>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 id="unpaid-individual-entries-title" className="text-sm font-semibold text-foreground">
                      未決済のエントリー試行
                    </h4>
                    <EntriesCountBadge count={unpaidIndividualListRows.length} tone="amber" />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    参加費の決済が成立していないため、出場者一覧・CSV には含めません。
                  </p>
                </div>
              </div>
              <UnpaidIndividualEntriesResponsive
                competitionId={competition.id}
                rows={unpaidIndividualListRows}
                emptyMessage="未決済のエントリー試行はありません。"
              />
            </section>
            <div className="border-t border-border/50 pt-5">
              <section className="space-y-3" aria-labelledby="post-pay-pending-entries-title">
                <div className="flex flex-wrap items-start gap-3">
                  <EntriesIconBadge tone="muted">
                    <Clock className="size-4" strokeWidth={1.75} aria-hidden />
                  </EntriesIconBadge>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 id="post-pay-pending-entries-title" className="text-sm font-semibold text-foreground">
                        後払い承認済み（入金待ち）
                      </h4>
                      <EntriesCountBadge count={postPayPendingListRows.length} />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      エントリーは成立していますが参加費は未入金です。
                    </p>
                  </div>
                </div>
                <PostPayPendingEntriesResponsive
                  competitionId={competition.id}
                  rows={postPayPendingListRows}
                  emptyMessage="後払い承認済みで入金待ちのエントリーはありません。"
                />
              </section>
            </div>
          </div>
        </OrgEditorialPanel>
      </EntriesSectionBlock>

      <EntriesSectionBlock label="Tools">
        <CompetitionHostInviteEntryPanel
        competitionId={competitionId}
        individualEvents={individualEventOptions}
        teamEvents={teamEventOptions}
        />
      </EntriesSectionBlock>
    </div>
  );
}
