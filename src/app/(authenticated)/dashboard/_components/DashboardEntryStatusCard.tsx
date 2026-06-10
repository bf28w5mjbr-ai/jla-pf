import type { ReactNode } from "react";
import Link from "next/link";
import type { CompetitionEntryStatus } from "@prisma/client";
import { ArrowRight, CalendarDays, ReceiptText } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import type { WithdrawableEventOption } from "@/lib/entryWithdrawalRequest";
import { cn } from "@/lib/utils";
import { EntryWithdrawRequestButtonLazy } from "./dashboardDynamicClients";
import {
  dashboardEntryPaymentToneClass,
  getDashboardCompetitionPhaseVisual,
  getDashboardEntryPaymentVisual,
} from "./dashboardEntryStatusVisual";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

type Props = {
  entryId: string;
  competitionId: string;
  competitionName: string;
  competitionStartDate: Date;
  competitionStatus: string;
  createdAt: Date;
  totalFee: number;
  entryStatus: CompetitionEntryStatus;
  businessEstablished: boolean;
  userLabel: string;
  hasOpenDispute?: boolean;
  withdrawnCount: number;
  canIssueReceipt: boolean;
  isResultPublished: boolean;
  canRequestWithdraw: boolean;
  withdrawableEvents: WithdrawableEventOption[];
};

function DashboardEntryActionLink({
  href,
  children,
  external,
  className,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "group inline-flex items-center gap-1.5 text-sm font-medium text-foreground/85 transition-colors hover:text-orange-700 dark:hover:text-orange-200",
        className
      )}
    >
      <span>{children}</span>
      <ArrowRight
        className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

export function DashboardEntryStatusCard({
  entryId,
  competitionId,
  competitionName,
  competitionStartDate,
  competitionStatus,
  createdAt,
  totalFee,
  entryStatus,
  businessEstablished,
  userLabel,
  hasOpenDispute,
  withdrawnCount,
  canIssueReceipt,
  isResultPublished,
  canRequestWithdraw,
  withdrawableEvents,
}: Props) {
  const payment = getDashboardEntryPaymentVisual({
    entryStatus,
    businessEstablished,
    userLabel,
    hasOpenDispute,
  });
  const phase = getDashboardCompetitionPhaseVisual(competitionStatus);
  const hasWithdrawRequest = withdrawnCount > 0;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 py-5 pl-5 pr-5 sm:py-6 sm:pl-6 sm:pr-6",
        "transition-[border-color,background-color] duration-200",
        "hover:border-orange-200/70 hover:bg-orange-50/25 dark:hover:border-orange-900/45 dark:hover:bg-orange-950/15"
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-orange-500/8 dark:bg-orange-400/6"
        aria-hidden
      />
      <div
        className="absolute bottom-5 left-0 top-5 w-0.5 rounded-full bg-gradient-to-b from-orange-500/70 via-orange-400/35 to-transparent sm:bottom-6 sm:top-6"
        aria-hidden
      />

      <div className="relative flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-snug",
                dashboardEntryPaymentToneClass(payment.tone)
              )}
            >
              <span className="truncate">{payment.label}</span>
            </span>
            {phase ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                  phase.className
                )}
              >
                {phase.label}
              </span>
            ) : null}
          </div>
          <p className="shrink-0 font-mono text-sm font-semibold tabular-nums tracking-tight text-foreground">
            ¥{totalFee.toLocaleString()}
          </p>
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
            <Link
              href={appRoutes.competitions.entry(competitionId)}
              className="transition-colors hover:text-orange-700 dark:hover:text-orange-200"
            >
              {competitionName}
            </Link>
          </h3>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
              大会 {dateFormatter.format(competitionStartDate)}
            </span>
            <span>受付 {dateFormatter.format(createdAt)}</span>
          </div>

          {hasWithdrawRequest ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              棄権申請済み（{withdrawnCount}種目）
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/45 pt-4">
          <DashboardEntryActionLink href={appRoutes.competitions.entry(competitionId)}>
            エントリー詳細
          </DashboardEntryActionLink>
          {canIssueReceipt ? (
            <Link
              href={`/api/entries/${entryId}/receipt?format=pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ReceiptText className="size-3.5" strokeWidth={1.75} aria-hidden />
              領収書
            </Link>
          ) : null}
          {isResultPublished ? (
            <DashboardEntryActionLink href={appRoutes.competitions.results(competitionId)}>
              大会リザルト
            </DashboardEntryActionLink>
          ) : null}
          {canRequestWithdraw ? (
            <EntryWithdrawRequestButtonLazy
              competitionId={competitionId}
              entryId={entryId}
              withdrawableEvents={withdrawableEvents}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
