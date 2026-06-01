import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import {
  CLUB_STATUS_BADGE_CLASS,
  CLUB_STATUS_LABEL,
  loadClubDetailPageData,
} from "@/lib/clubDetailPageLoader";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  CircleDot,
  MapPin,
  Phone,
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
import { ClubCompetitionSectionCount } from "./ClubCompetitionSectionCount";

type Props = {
  clubId: string;
};

export async function ClubDetailHeaderLoader({ clubId }: Props) {
  const userId = await getRequiredAuthenticatedUserId();

  const sessionUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!sessionUser) redirect("/login");

  const { club, userMembership, approvedMemberCount, isClubAdmin, representativeMemberOptions } =
    await loadClubDetailPageData(clubId, userId);

  const officeAddressParts = [
    club.officePostalCode ? `〒${club.officePostalCode}` : null,
    [club.officePrefecture, club.officeCity].filter(Boolean).join(""),
    club.officeAddressLine1?.trim() || null,
    club.officeAddressLine2?.trim() || null,
  ].filter(Boolean) as string[];
  const officeAddressLine = officeAddressParts.join("");

  return (
    <header>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted/35 via-background to-muted/25 shadow-sm">
        <div className="space-y-2 p-3 sm:space-y-2.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs sm:text-sm" asChild>
              <Link href={appRoutes.profile.clubs()}>
                <ArrowLeft className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
                <span className="max-sm:sr-only">所属クラブに戻る</span>
                <span className="sm:hidden">戻る</span>
              </Link>
            </Button>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              {isClubAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2.5 text-xs sm:gap-1.5 sm:px-3 sm:text-sm"
                  asChild
                >
                  <Link href={appRoutes.clubs.edit(club.id)}>
                    クラブ情報を編集
                    <ChevronRight className="h-3.5 w-3.5 opacity-70 sm:h-4 sm:w-4" aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-primary">
            <Users
              className="h-4 w-4 shrink-0 sm:h-[1.125rem] sm:w-[1.125rem]"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-xs font-medium sm:text-sm">クラブ</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="inline-flex shrink-0 flex-col items-center rounded-lg border border-border/50 bg-muted/10 p-1.5 shadow-sm">
              <ClubLogoUploadLazy
                clubId={club.id}
                currentLogoUrl={club.logoUrl}
                clubName={club.name}
                canEdit={isClubAdmin}
                variant="compact"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-balance text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {club.name}
              </h1>
              {club.nameKana ? (
                <p className="text-xs text-muted-foreground sm:text-sm">{club.nameKana}</p>
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

          <div
            className="grid gap-1.5 border-t border-border/60 pt-2.5 sm:grid-cols-3 sm:pt-3"
            role="group"
            aria-label="クラブの概要"
          >
            <div className="flex min-h-0 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 sm:min-h-[2.5rem] sm:gap-2 sm:px-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-8 sm:w-8">
                <CircleDot className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium text-muted-foreground">状態</span>
                <div className="mt-0.5">
                  <span
                    className={cn(
                      "inline-flex w-fit max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                      CLUB_STATUS_BADGE_CLASS[club.status as keyof typeof CLUB_STATUS_BADGE_CLASS] ??
                        "border-border bg-muted text-muted-foreground"
                    )}
                  >
                    {CLUB_STATUS_LABEL[club.status as keyof typeof CLUB_STATUS_LABEL] ?? club.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex min-h-0 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 sm:min-h-[2.5rem] sm:gap-2 sm:px-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-8 sm:w-8">
                <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <div>
                <span className="text-[11px] font-medium text-muted-foreground">参加大会</span>
                <p className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                  <Suspense
                    fallback={
                      <>
                        <span className="inline-block h-4 w-6 animate-pulse rounded bg-muted-foreground/15" />
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground sm:text-xs">
                          件
                        </span>
                      </>
                    }
                  >
                    <ClubCompetitionSectionCount clubId={clubId} clubName={club.name} />
                  </Suspense>
                </p>
              </div>
            </div>
            <div className="flex min-h-0 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 sm:min-h-[2.5rem] sm:gap-2 sm:px-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-8 sm:w-8">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <div>
                <span className="text-[11px] font-medium text-muted-foreground">メンバー</span>
                <p className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                  {approvedMemberCount.toLocaleString("ja-JP")}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground sm:text-xs">
                    名
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-2.5 sm:pt-3">
            <p className="mb-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              大会エントリーやお問い合わせの際に参照されることがあります。
            </p>
            <div className="rounded-lg border border-border/40 bg-background/40 p-2 sm:p-2.5">
              <div className="grid gap-1.5 text-sm sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2 lg:grid-cols-3">
                {club.representativePhone ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Phone className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">代表者TEL</span>
                      <p className="tabular-nums font-medium text-foreground">
                        {club.representativePhone}
                      </p>
                    </div>
                  </div>
                ) : null}
                {club.officePhone ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Phone className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">事務局TEL</span>
                      <p className="tabular-nums font-medium text-foreground">{club.officePhone}</p>
                    </div>
                  </div>
                ) : null}
                {club.establishedYear ? (
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">設立年</span>
                      <p className="tabular-nums font-medium text-foreground">
                        {club.establishedYear}年
                      </p>
                    </div>
                  </div>
                ) : null}
                {club.patrolLocation ? (
                  <div className="flex min-w-0 items-start gap-1.5 sm:col-span-2 lg:col-span-1">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 leading-snug">
                      <span className="text-[11px] font-medium text-muted-foreground">監視場所</span>
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {club.patrolLocation}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {officeAddressLine ? (
                <div className="mt-2.5 flex min-w-0 items-start gap-1.5 border-t border-border/50 pt-2.5">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" aria-hidden />
                  <div className="min-w-0 leading-snug">
                    <span className="text-[11px] font-medium text-muted-foreground">事務局所在地</span>
                    <p className="text-xs font-medium leading-snug text-foreground sm:text-sm">
                      {officeAddressLine}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {userMembership?.status === "APPROVED" ? (
            <div className="flex justify-end border-t border-border/60 pt-2.5 sm:pt-3">
              <LeaveClubButtonLazy clubId={club.id} clubName={club.name} />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
