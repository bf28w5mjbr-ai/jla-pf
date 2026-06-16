import { Badge } from "@/components/ui/badge";
import { isClubAdminRole } from "@/lib/roleScopes";
import { membershipRoleLabelJa } from "@/lib/membershipDisplay";
import type { ClubMemberRow } from "@/lib/clubMembersTabLoader";
import { MemberActionsLazy } from "./clubDynamicClients";

function memberDisplayName(member: ClubMemberRow): string {
  const name = `${member.user.profile?.familyName ?? ""} ${member.user.profile?.givenName ?? ""}`.trim();
  return name || "（名前未設定）";
}

function MemberRoleBadge({ role }: { role: string }) {
  const admin = isClubAdminRole(role);
  return (
    <Badge
      variant={admin ? "default" : "secondary"}
      className="h-[1.125rem] shrink-0 px-1 text-[10px] font-normal leading-none"
    >
      {membershipRoleLabelJa(role)}
    </Badge>
  );
}

function MemberListItem({
  member,
  clubId,
  currentUserId,
  currentUserRole,
  showEmail,
  variant = "default",
}: {
  member: ClubMemberRow;
  clubId: string;
  currentUserId: string;
  currentUserRole: string;
  showEmail?: boolean;
  variant?: "default" | "pending";
}) {
  const isSelf = currentUserId === member.userId;
  const showActions = !isSelf;
  const secondaryLine =
    variant === "pending"
      ? `${member.user.email} · ${new Date(member.createdAt).toLocaleDateString("ja-JP")} 申請`
      : showEmail
        ? member.user.email
        : null;

  return (
    <li
      className={
        variant === "pending"
          ? "flex items-center gap-2 border-b border-amber-200/50 px-2.5 py-1.5 last:border-b-0 dark:border-amber-900/40 sm:px-3"
          : "flex items-center gap-2 border-b border-border/45 px-2.5 py-1.5 last:border-b-0 sm:px-3"
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium leading-tight text-foreground">
            {memberDisplayName(member)}
          </span>
          <MemberRoleBadge role={member.role} />
        </div>
        {secondaryLine ? (
          <p className="truncate text-[10px] leading-tight text-muted-foreground">{secondaryLine}</p>
        ) : null}
      </div>
      {showActions ? (
        <div className="shrink-0">
          <MemberActionsLazy
            membershipId={member.id}
            clubId={clubId}
            status={member.status}
            role={member.role}
            currentUserId={currentUserId}
            targetUserId={member.userId}
            currentUserRole={currentUserRole}
            compact
          />
        </div>
      ) : null}
    </li>
  );
}

export function ClubApprovedMemberList({
  members,
  clubId,
  currentUserId,
  currentUserRole,
  showEmail,
}: {
  members: ClubMemberRow[];
  clubId: string;
  currentUserId: string;
  currentUserRole: string;
  showEmail: boolean;
}) {
  if (members.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
        メンバーがいません
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-border/55 bg-card/50 text-sm">
      {members.map((member) => (
        <MemberListItem
          key={member.id}
          member={member}
          clubId={clubId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          showEmail={showEmail}
        />
      ))}
    </ul>
  );
}

export function ClubPendingMemberList({
  members,
  clubId,
  currentUserId,
  currentUserRole,
}: {
  members: ClubMemberRow[];
  clubId: string;
  currentUserId: string;
  currentUserRole: string;
}) {
  if (members.length === 0) return null;

  return (
    <ul className="overflow-hidden rounded-lg border border-amber-300/45 bg-amber-50/30 text-sm dark:border-amber-900/45 dark:bg-amber-950/15">
      {members.map((member) => (
        <MemberListItem
          key={member.id}
          member={member}
          variant="pending"
          clubId={clubId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      ))}
    </ul>
  );
}
