import { Badge } from "@/components/ui/badge";
import { OrgSubheading } from "@/app/(authenticated)/organizations/[id]/_components/organizationEditorialUi";
import { loadClubMembersTab } from "@/lib/clubMembersTabLoader";
import {
  ClubApprovedMemberList,
  ClubPendingMemberList,
} from "./ClubMemberCompactList";

export async function ClubMembersTabPanel({
  clubId,
  currentUserId,
}: {
  clubId: string;
  currentUserId: string;
}) {
  const { userMembership, isClubAdmin, approvedMembers, pendingMembers } =
    await loadClubMembersTab(clubId, currentUserId);

  const currentUserRole = userMembership?.role || "MEMBER";

  return (
    <section className="rounded-2xl border border-border/55 bg-background/70 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/45 pb-3">
        <div>
          <OrgSubheading>Team</OrgSubheading>
          <h3 className="mt-1 text-base font-semibold text-foreground sm:text-lg">メンバー</h3>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{approvedMembers.length}</span> 名
        </p>
      </div>

      {isClubAdmin && pendingMembers.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-foreground">参加申請</p>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
              {pendingMembers.length}
            </Badge>
          </div>
          <ClubPendingMemberList
            members={pendingMembers}
            clubId={clubId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
          />
        </div>
      ) : null}

      <div className="mt-3 space-y-1.5">
        {isClubAdmin && pendingMembers.length > 0 ? (
          <p className="text-xs font-medium text-muted-foreground">承認済みメンバー</p>
        ) : null}
        <ClubApprovedMemberList
          members={approvedMembers}
          clubId={clubId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          showEmail={isClubAdmin}
        />
      </div>
    </section>
  );
}
