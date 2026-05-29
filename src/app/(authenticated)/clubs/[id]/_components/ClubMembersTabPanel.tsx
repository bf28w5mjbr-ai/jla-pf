import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import { isClubAdminRole } from "@/lib/roleScopes";
import { membershipRoleLabelJa } from "@/lib/membershipDisplay";
import { loadClubMembersTab } from "@/lib/clubMembersTabLoader";
import { cn } from "@/lib/utils";
import { MemberActionsLazy } from "./clubDynamicClients";

function membershipStatusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "承認済み";
    case "PENDING":
      return "承認待ち";
    case "REJECTED":
      return "却下";
    default:
      return status;
  }
}

export async function ClubMembersTabPanel({
  clubId,
  currentUserId,
}: {
  clubId: string;
  currentUserId: string;
}) {
  const { userMembership, isClubAdmin, approvedMembers, pendingMembers } =
    await loadClubMembersTab(clubId, currentUserId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">メンバー管理</h2>
      </div>

      {isClubAdmin && pendingMembers.length > 0 ? (
        <Card padding="none">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span>参加申請</span>
              <Badge variant="secondary" className="tabular-nums">
                {pendingMembers.length} 件
              </Badge>
            </CardTitle>
          </CardHeader>
          <DataTable
            data={pendingMembers}
            columns={[
              {
                header: "氏名",
                accessor: (m) =>
                  `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
                className: "font-medium text-foreground",
              },
              {
                header: "メール",
                accessor: (m) => m.user.email,
                className: "font-mono text-sm text-muted-foreground",
              },
              {
                header: "申請日",
                accessor: (m) => new Date(m.createdAt).toLocaleDateString("ja-JP"),
                className: "text-sm text-muted-foreground",
              },
              {
                header: "操作",
                accessor: (m) => (
                  <MemberActionsLazy
                    membershipId={m.id}
                    clubId={clubId}
                    status={m.status}
                    role={m.role}
                    currentUserId={currentUserId}
                    targetUserId={m.userId}
                    currentUserRole={userMembership?.role || "MEMBER"}
                  />
                ),
              },
            ]}
            keyExtractor={(m) => m.id}
            emptyMessage="申請はありません"
          />
        </Card>
      ) : null}

      <Card padding="none">
        <CardHeader>
          <CardTitle className="text-base">メンバー一覧</CardTitle>
        </CardHeader>
        <DataTable
          data={approvedMembers}
          columns={[
            {
              header: "氏名",
              accessor: (m) =>
                `${m.user.profile?.familyName ?? ""} ${m.user.profile?.givenName ?? ""}`.trim(),
              className: "font-medium text-foreground",
            },
            {
              header: "役割",
              accessor: (m) => (
                <Badge
                  variant={isClubAdminRole(m.role) ? "default" : "secondary"}
                  className="font-normal"
                >
                  {membershipRoleLabelJa(m.role)}
                </Badge>
              ),
            },
            {
              header: "ステータス",
              accessor: (m) => (
                <Badge
                  variant="outline"
                  className={cn(
                    m.status === "APPROVED" &&
                      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                    m.status === "PENDING" &&
                      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
                    m.status === "REJECTED" &&
                      "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                  )}
                >
                  {membershipStatusLabel(m.status)}
                </Badge>
              ),
            },
            ...(isClubAdmin
              ? [
                  {
                    header: "操作",
                    accessor: (m: (typeof approvedMembers)[0]) => (
                      <MemberActionsLazy
                        membershipId={m.id}
                        clubId={clubId}
                        status={m.status}
                        role={m.role}
                        currentUserId={currentUserId}
                        targetUserId={m.userId}
                        currentUserRole={userMembership?.role || "MEMBER"}
                      />
                    ),
                  },
                ]
              : []),
          ]}
          keyExtractor={(m) => m.id}
          emptyMessage="メンバーがいません"
        />
      </Card>
    </div>
  );
}
