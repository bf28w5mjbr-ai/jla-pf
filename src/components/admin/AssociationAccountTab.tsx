import Link from "next/link";
import {
  Award,
  Building2,
  ChevronRight,
  ClipboardList,
  Inbox,
  Landmark,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import AssociationAccessGrantForm from "@/components/AssociationAccessGrantForm";
import { QuickLinkCard, StatCard } from "@/components/admin/account-admin-dashboard-cards";

const associationStatusLabel: Record<string, string> = {
  PENDING: "承認待ち",
  APPROVED: "承認済",
};

const associationAdminRoleLabel: Record<string, string> = {
  ADMIN: "管理者",
  MEMBER: "メンバー",
};

type AssociationRow = {
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
};

export default function AssociationAccountTab({
  isPfAdmin,
  pendingQualificationCount,
  userCount,
  clubCount,
  applyingClubCount,
  associations,
}: {
  isPfAdmin: boolean;
  pendingQualificationCount: number;
  userCount: number;
  clubCount: number;
  applyingClubCount: number;
  associations: AssociationRow[];
}) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Landmark className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">協会</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          資格審査・クラブ指標、管轄協会と管理者の一覧です。
        </p>
      </div>

      <section aria-labelledby="kpi-heading" className="space-y-4">
        <div>
          <h2 id="kpi-heading" className="text-lg font-semibold text-foreground">
            全体指標
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            プラットフォーム全体のおおまかな数値です。カードをクリックして詳細へ進めます。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="資格申請（保留）"
            value={pendingQualificationCount}
            hint="承認待ちの資格件数"
            icon={ClipboardList}
            href="/admin/qualifications"
            accent="amber"
            emphasize
          />
          <StatCard
            title="会員数"
            value={userCount}
            hint="登録ユーザー総数"
            icon={Users}
            accent="slate"
          />
          <StatCard
            title="クラブ数"
            value={clubCount}
            hint="登録クラブ総数"
            icon={Building2}
            accent="emerald"
          />
          <StatCard
            title="クラブ申請"
            value={applyingClubCount}
            hint="申請中のクラブ件数"
            icon={Inbox}
            href={isPfAdmin ? "/admin/club-applications" : undefined}
            accent="orange"
            emphasize={isPfAdmin}
          />
        </div>
      </section>

      <section aria-labelledby="shortcuts-heading" className="space-y-4">
        <div>
          <h2 id="shortcuts-heading" className="text-lg font-semibold text-foreground">
            よく使う操作
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            審査・申請フローへのショートカットです。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <QuickLinkCard
            title="資格の承認・却下"
            description="保留中の資格申請を審査し、承認または却下します。"
            href="/admin/qualifications"
            icon={Award}
          />
          {isPfAdmin ? (
            <QuickLinkCard
              title="クラブ申請の審査"
              description="申請中のクラブを確認し、承認フローへ進めます。"
              href="/admin/club-applications"
              icon={Building2}
            />
          ) : (
            <div className="flex flex-col justify-center rounded-2xl border border-dashed border-border/90 bg-muted/25 px-5 py-8 text-center text-sm leading-relaxed text-muted-foreground">
              <p>
                クラブ申請の審査はプラットフォーム管理者のみ実行できます。ご不明な点は運営へお問い合わせください。
              </p>
            </div>
          )}
        </div>
      </section>

      {isPfAdmin ? (
        <section aria-labelledby="grant-heading" className="space-y-3">
          <div>
            <h2 id="grant-heading" className="text-lg font-semibold text-foreground">
              協会アクセスの付与
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              登録済みユーザーに、メールアドレスで協会管理者権限を付与します。
            </p>
          </div>
          <AssociationAccessGrantForm
            associations={associations.map((association) => ({
              id: association.id,
              name: association.name,
              abbreviation: association.abbreviation,
            }))}
          />
        </section>
      ) : null}

      <section aria-labelledby="associations-heading" className="space-y-4">
        <div>
          <h2 id="associations-heading" className="text-lg font-semibold text-foreground">
            管轄協会
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            あなたが管理権限を持つ協会と、登録されている管理者です。
          </p>
        </div>

        {associations.length === 0 ? (
          <Card className="border-dashed border-border/90 shadow-sm">
            <CardContent className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">協会がまだありません</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isPfAdmin
                  ? "新しい協会を作成すると、ここに一覧表示されます。"
                  : "協会管理者として割り当てられると、ここに表示されます。"}
              </p>
              {isPfAdmin ? (
                <Button className="mt-6 gap-1.5" asChild>
                  <Link href="/associations/create">
                    協会を作成
                    <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {associations.map((association) => {
              const statusKey = association.status;
              const statusJa = associationStatusLabel[statusKey] ?? statusKey;
              const isApproved = association.status === "APPROVED";

              return (
                <Card key={association.id} className="overflow-hidden border-border/90 shadow-sm">
                  <CardHeader className="space-y-3 border-b border-border/60 bg-muted/15 sm:flex sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-xl">{association.name}</CardTitle>
                        <Badge variant={isApproved ? "secondary" : "outline"}>{statusJa}</Badge>
                      </div>
                      <CardDescription>
                        {association.abbreviation ? (
                          <span>略称 {association.abbreviation}</span>
                        ) : (
                          <span>略称なし</span>
                        )}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {association.admins.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                        まだ協会アクセス権限が付与されていません。
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
                            {association.admins.map((admin) => (
                              <TableRow key={admin.id}>
                                <TableCell className="font-medium text-foreground">
                                  {admin.user.familyName} {admin.user.givenName}
                                </TableCell>
                                <TableCell className="font-mono text-sm text-muted-foreground">
                                  {admin.user.email}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-normal">
                                    {associationAdminRoleLabel[admin.role] ?? admin.role}
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
    </>
  );
}
