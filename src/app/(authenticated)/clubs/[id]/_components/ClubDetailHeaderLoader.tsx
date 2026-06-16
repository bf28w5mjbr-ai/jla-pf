import Link from "next/link";
import { Suspense } from "react";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import {
  CLUB_STATUS_BADGE_CLASS,
  CLUB_STATUS_LABEL,
  loadClubDetailPageData,
} from "@/lib/clubDetailPageLoader";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import {
  OrgEditorialPanel,
  OrgFact,
  OrgSubheading,
} from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Phone,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import {
  ClubLogoUploadLazy,
  ClubRepresentativeSelectorLazy,
  LeaveClubButtonLazy,
} from "./clubDynamicClients";
import { ClubCompetitionTabBadgeCount } from "./ClubCompetitionSectionCount";

type Props = {
  clubId: string;
};

export async function ClubDetailHeaderLoader({ clubId }: Props) {
  const userId = await getRequiredAuthenticatedUserId();

  const { club, userMembership, approvedMemberCount, isClubAdmin, representativeMemberOptions } =
    await loadClubDetailPageData(clubId, userId);

  const officeAddressParts = [
    club.officePostalCode ? `〒${club.officePostalCode}` : null,
    [club.officePrefecture, club.officeCity].filter(Boolean).join(""),
    club.officeAddressLine1?.trim() || null,
    club.officeAddressLine2?.trim() || null,
  ].filter(Boolean) as string[];
  const officeAddressLine = officeAddressParts.join(" ");

  const hasContactProfile =
    club.representativePhone ||
    club.officePhone ||
    club.establishedYear ||
    club.patrolLocation ||
    officeAddressLine;

  return (
    <>
      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-0 pt-10 sm:pt-12"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={appRoutes.profile.clubs()}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-1.5 text-sm text-muted-foreground",
              "transition-colors hover:border-border/60 hover:bg-muted/30 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <ArrowLeft
              className="size-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden
            />
            所属クラブに戻る
          </Link>
          {isClubAdmin ? (
            <Link
              href={appRoutes.clubs.edit(club.id)}
              aria-label="クラブ情報を編集"
              className={cn(
                "group inline-flex shrink-0 items-center justify-center p-1 text-muted-foreground",
                "transition-colors hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <Settings
                className="size-[1.125rem] transition-transform duration-300 group-hover:rotate-90 sm:size-5"
                strokeWidth={1.75}
                aria-hidden
              />
            </Link>
          ) : null}
        </div>
      </section>

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-12 pt-8 sm:pb-16 sm:pt-10"
        )}
      >
        <OrgEditorialPanel accent="emerald">
          <OrgSubheading>Club</OrgSubheading>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="inline-flex shrink-0 flex-col items-center rounded-2xl border border-border/55 bg-background/80 p-2 shadow-sm">
              <ClubLogoUploadLazy
                clubId={club.id}
                currentLogoUrl={club.logoUrl}
                clubName={club.name}
                canEdit={isClubAdmin}
                variant="compact"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                {club.name}
              </h1>
              {club.nameKana ? (
                <p className="text-sm tracking-wide text-muted-foreground">{club.nameKana}</p>
              ) : null}
              <ClubRepresentativeSelectorLazy
                clubId={club.id}
                currentRepresentativeUserId={club.representativeUserId}
                isClubAdmin={isClubAdmin}
                layout="inline"
                representativeNameFallback={
                  [club.representativeFamilyName, club.representativeGivenName]
                    .map((s) => s?.trim())
                    .filter(Boolean)
                    .join(" ") || null
                }
                members={representativeMemberOptions}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/45 pt-5">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium sm:text-sm",
                CLUB_STATUS_BADGE_CLASS[club.status as keyof typeof CLUB_STATUS_BADGE_CLASS] ??
                  "border-border bg-muted text-muted-foreground"
              )}
            >
              {CLUB_STATUS_LABEL[club.status as keyof typeof CLUB_STATUS_LABEL] ?? club.status}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-foreground sm:text-sm">
              <Trophy className="size-3.5 opacity-70" strokeWidth={1.75} aria-hidden />
              参加大会{" "}
              <span className="tabular-nums">
                <Suspense
                  fallback={
                    <span className="inline-block h-3.5 w-5 animate-pulse rounded bg-muted-foreground/20" />
                  }
                >
                  <ClubCompetitionTabBadgeCount clubId={clubId} clubName={club.name} />
                </Suspense>
              </span>
              件
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-foreground sm:text-sm">
              <Users className="size-3.5 opacity-70" strokeWidth={1.75} aria-hidden />
              メンバー{" "}
              <span className="tabular-nums">
                {approvedMemberCount.toLocaleString("ja-JP")}
              </span>
              名
            </span>
          </div>
        </OrgEditorialPanel>

        {hasContactProfile ? (
          <OrgEditorialPanel accent="muted" className="mt-5">
            <OrgSubheading>Contact</OrgSubheading>
            <p className="mt-2 text-sm text-muted-foreground">
              大会エントリーやお問い合わせの際に参照されることがあります。
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {club.representativePhone ? (
                <OrgFact icon={Phone} label="代表者TEL" value={club.representativePhone} mono />
              ) : null}
              {club.officePhone ? (
                <OrgFact icon={Phone} label="事務局TEL" value={club.officePhone} mono />
              ) : null}
              {club.establishedYear ? (
                <OrgFact icon={Calendar} label="設立年" value={`${club.establishedYear}年`} />
              ) : null}
              {club.patrolLocation ? (
                <OrgFact icon={MapPin} label="監視場所" value={club.patrolLocation} />
              ) : null}
            </div>
            {officeAddressLine ? (
              <div className="mt-4 border-t border-border/45 pt-4">
                <OrgFact icon={MapPin} label="事務局所在地" value={officeAddressLine} />
              </div>
            ) : null}
          </OrgEditorialPanel>
        ) : null}

        {userMembership?.status === "APPROVED" ? (
          <div className="mt-5 flex justify-end">
            <LeaveClubButtonLazy clubId={club.id} clubName={club.name} />
          </div>
        ) : null}
      </section>
    </>
  );
}
