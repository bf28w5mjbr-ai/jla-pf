import Link from "next/link";
import { Metadata } from "next";

import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Award, BookOpen, GraduationCap, ListChecks } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import { CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP } from "@/lib/competitionEntryAgeTiered";
import { isRegistrationQualificationKind } from "@/lib/qualificationRegistrationKinds";
import { normalizeQualificationKind, parseQualificationTemplateMeta } from "@/lib/qualificationTemplateRules";
import JlaMemberNumberEditor from "./JlaMemberNumberEditor";
import QualificationsSelectionClient from "../../qualifications/QualificationsSelectionClient";

export const metadata: Metadata = {
  title: "資格の管理 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function ProfileQualificationsPage() {
  const userId = await getRequiredAuthenticatedUserId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      jlaMemberNumber: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const [qualifications, rawTemplates] = await Promise.all([
    prisma.qualification.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.qualificationTemplate.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: {
        id: true,
        kind: true,
        name: true,
        description: true,
        requiresExpiry: true,
        validityMonths: true,
        domain: true,
        level: true,
        minAge: true,
        prerequisiteExpression: true,
        nextKinds: true,
      },
    }),
  ]);

  const templatesForClient = rawTemplates.map((template) => ({
    ...template,
    name: template.name?.trim() || template.kind,
    ...parseQualificationTemplateMeta(template.description),
  }));

  const linkedKinds = qualifications
    .filter((q) => q.status === "APPROVED" || q.status === "PENDING")
    .map((q) => q.kind);

  const isRegistrationTemplate = (template: (typeof rawTemplates)[number]) =>
    isRegistrationQualificationKind(template.kind) || isRegistrationQualificationKind(template.name);

  const isOwnedTemplate = (template: (typeof rawTemplates)[number]) =>
    qualifications.some(
      (q) =>
        q.status === "APPROVED" &&
        (normalizeQualificationKind(q.kind) === normalizeQualificationKind(template.kind) ||
          normalizeQualificationKind(q.kind) === normalizeQualificationKind(template.name ?? ""))
    );

  const templateByKind = new Map<string, (typeof rawTemplates)[number]>();
  for (const template of rawTemplates) {
    if (!templateByKind.has(template.kind)) {
      templateByKind.set(template.kind, template);
    }
  }

  const ownedQualifications = qualifications.filter(
    (q) => !isRegistrationQualificationKind(q.kind) && q.status === "APPROVED"
  );

  const unownedTemplates = rawTemplates.filter(
    (template) => !isOwnedTemplate(template) && !isRegistrationTemplate(template)
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <Button variant="ghost" size="sm" className="-ml-2 h-9 gap-1.5 px-2 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            ダッシュボードに戻る
          </Link>
        </Button>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Award className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium">資格</span>
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            資格の管理
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            チェックボックスで資格を選んで保存すると、すぐにアカウントに紐づきます。更新講習の案内は下の一覧から進められます。
          </p>
        </div>
      </header>

      <JlaMemberNumberEditor initialValue={user.jlaMemberNumber} />

      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">資格の紐づけ</CardTitle>
          </div>
          <CardDescription className="space-y-2">
            <span className="block">
              保有している資格にチェックを入れて保存してください。JLAメンバーIDがアカウントに未登録のときだけ、資格を保存する際に下の必須欄（または上のカード）でIDが必要です。登録済みの場合は不要です。
            </span>
            <span className="block text-muted-foreground">{CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          {templatesForClient.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              表示できる資格がありません。
            </p>
          ) : (
            <QualificationsSelectionClient
              templates={templatesForClient}
              linkedKinds={linkedKinds}
              initialJlaMemberNumber={user.jlaMemberNumber}
            />
          )}
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="owned-qual-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-1">
            <h2
              id="owned-qual-heading"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
            >
              <GraduationCap className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
              申請済み資格（更新講習）
            </h2>
            <p className="text-sm text-muted-foreground">紐づけ済みの資格から、更新のための講習情報へ進めます。</p>
          </div>
        </div>

        {ownedQualifications.length === 0 ? (
          <Card className="border-dashed border-border/90 bg-muted/15">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Award className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">表示する資格はまだありません</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                上の一覧で資格にチェックを入れて保存すると、ここに表示されます。
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {ownedQualifications.map((qualification) => {
              const template = templateByKind.get(qualification.kind);
              const expiryDate = qualification.expiryDate ? new Date(qualification.expiryDate) : null;
              const lessonLink = `/lessons?qualification=${encodeURIComponent(qualification.kind)}&renewal=1`;

              return (
                <Card
                  key={qualification.id}
                  padding="none"
                  className="overflow-hidden border-border/90 shadow-sm"
                >
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-base font-semibold text-foreground">
                          {template?.name ?? qualification.kind}
                        </h3>
                        {template?.description ? (
                          <p className="text-xs text-muted-foreground">{template.description}</p>
                        ) : null}
                      </div>
                      <Button size="sm" className="shrink-0 gap-1.5 sm:self-start" asChild>
                        <Link href={lessonLink}>
                          更新講習へ
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </Button>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-3">
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <dt className="text-xs font-medium text-muted-foreground">発行日</dt>
                        <dd className="mt-0.5 text-foreground">
                          {qualification.issueDate
                            ? new Date(qualification.issueDate).toLocaleDateString("ja-JP")
                            : "未登録"}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <dt className="text-xs font-medium text-muted-foreground">有効期限</dt>
                        <dd className="mt-0.5 text-foreground">
                          {expiryDate ? expiryDate.toLocaleDateString("ja-JP") : "設定なし"}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                        <dt className="text-xs font-medium text-muted-foreground">システム登録日</dt>
                        <dd className="mt-0.5 tabular-nums text-foreground">
                          {new Date(qualification.createdAt).toLocaleDateString("ja-JP")}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">未取得の資格</CardTitle>
          </div>
          <CardDescription>まだ紐づけていない資格から、取得用の講習会情報へ進めます。</CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          {unownedTemplates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              未取得として一覧する資格はありません。
            </p>
          ) : (
            <ul className="grid gap-3">
              {unownedTemplates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{template.name ?? template.kind}</p>
                    {template.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                    ) : null}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 gap-1.5 sm:self-center" asChild>
                    <Link href={`/lessons?qualification=${encodeURIComponent(template.kind)}`}>
                      取得講習へ
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
