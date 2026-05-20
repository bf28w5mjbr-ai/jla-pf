import Link from "next/link";
import { ChevronRight, FileSpreadsheet, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import EntryCsvExportRequestsAdminPanel, {
  type PendingCsvExportRequestRow,
} from "@/components/admin/EntryCsvExportRequestsAdminPanel";
import CompetitionTypeApplicationsAdminPanel, {
  type PendingCompetitionTypeApplicationRow,
} from "@/components/admin/CompetitionTypeApplicationsAdminPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import HostOrganizerStatusActions from "@/components/admin/HostOrganizerStatusActions";

const orgStatusLabel: Record<string, string> = {
  PENDING: "登録中",
  APPROVED: "承認済",
  SUSPENDED: "停止中",
  INACTIVE: "無効",
};

const orgAdminRoleLabel: Record<string, string> = {
  ADMIN: "管理者",
  MEMBER: "メンバー",
};

type HostOrgRow = {
  id: string;
  name: string;
  abbreviation: string | null;
  status: string;
  admins: {
    id: string;
    role: string;
    user: {
      id: string;
      familyName: string;
      givenName: string;
      email: string;
    };
  }[];
  _count: { competitions: number };
};

export default function HostOrganizerAccountTab({
  organizations,
  isPfAdmin,
  pendingCsvExportRequests = [],
  pendingCompetitionTypeApplications = [],
}: {
  organizations: HostOrgRow[];
  isPfAdmin: boolean;
  pendingCsvExportRequests?: PendingCsvExportRequestRow[];
  pendingCompetitionTypeApplications?: PendingCompetitionTypeApplicationRow[];
}) {
  return (
    <section aria-labelledby="host-organizers-heading" className="space-y-5 sm:space-y-6">
      {isPfAdmin ? (
        <Card className="overflow-hidden border-border/90 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/15">
            <div className="flex items-center gap-2 text-foreground">
              <FileSpreadsheet className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
              <CardTitle className="text-base font-semibold">大会種別申請の承認</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              主催団体から届いた大会種別（A級/B級）の申請を承認すると、対象大会へ種別が付与されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 sm:pt-5">
            <CompetitionTypeApplicationsAdminPanel requests={pendingCompetitionTypeApplications} />
          </CardContent>
        </Card>
      ) : null}

      {isPfAdmin ? (
        <Card className="overflow-hidden border-border/90 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/15">
            <div className="flex items-center gap-2 text-foreground">
              <FileSpreadsheet className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
              <CardTitle className="text-base font-semibold">エントリーCSV出力の承認</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              主催団体から届いたCSV出力の依頼を承認すると、依頼者は大会管理のエントリー画面からフル項目のCSVをダウンロードできます（承認から30日間）。
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 sm:pt-5">
            <EntryCsvExportRequestsAdminPanel requests={pendingCsvExportRequests} />
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">主催団体</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 id="host-organizers-heading" className="text-lg font-semibold text-foreground">
              登録済みの主催団体
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              大会を主催する団体です。詳細から大会の作成・設定や管理者を確認できます。
              {isPfAdmin ? " PF管理者として、登録済みの主催団体を横断して参照できます。" : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
            <Link href="/organizations/create">
              主催団体を作成
              <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {organizations.length === 0 ? (
        <Card className="border-dashed border-border/90 shadow-sm">
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Trophy className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">主催団体がありません</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isPfAdmin
                ? "まだ主催団体が登録されていません。作成するとここに表示されます。"
                : "主催団体の管理者に追加されるか、新規に作成するとここに表示されます。"}
            </p>
            <Button className="mt-6 gap-1.5" asChild>
              <Link href="/organizations/create">
                主催団体を作成
                <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          {organizations.map((org) => {
            const statusJa = orgStatusLabel[org.status] ?? org.status;
            const isApproved = org.status === "APPROVED";

            return (
              <Card key={org.id} className="overflow-hidden border-border/90 shadow-sm">
                <CardHeader className="space-y-3 border-b border-border/60 bg-muted/15 sm:flex sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl">{org.name}</CardTitle>
                      <Badge variant={isApproved ? "secondary" : "outline"}>{statusJa}</Badge>
                    </div>
                    <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
                      {org.abbreviation ? <span>略称 {org.abbreviation}</span> : <span>略称なし</span>}
                      <span className="text-muted-foreground">
                        主催大会 {org._count.competitions.toLocaleString("ja-JP")} 件
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {isPfAdmin ? (
                      <HostOrganizerStatusActions organizationId={org.id} status={org.status} />
                    ) : null}
                    <Button variant="outline" size="sm" className="gap-1" asChild>
                      <Link href={`/organizations/${org.id}`}>
                        団体の詳細
                        <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {org.admins.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                      管理者が登録されていません。
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/80">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[28%] min-w-[8rem]">氏名</TableHead>
                            <TableHead className="min-w-[12rem]">メールアドレス</TableHead>
                            <TableHead className="w-[20%] min-w-[6rem]">ロール</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {org.admins.map((admin) => (
                            <TableRow key={admin.id}>
                              <TableCell className="font-medium text-foreground">
                                {admin.user.familyName} {admin.user.givenName}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground">
                                {admin.user.email}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-normal">
                                  {orgAdminRoleLabel[admin.role] ?? admin.role}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
