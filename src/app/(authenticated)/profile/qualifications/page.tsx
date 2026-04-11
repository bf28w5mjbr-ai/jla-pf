import Link from "next/link";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Award, BookOpen, ClipboardList, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { cn } from "@/lib/utils";
import QualificationRegisterButton from "./QualificationRegisterButton";
import JlaMemberNumberEditor from "./JlaMemberNumberEditor";

export const metadata: Metadata = {
  title: "保有資格の管理 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function ProfileQualificationsPage() {
  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const sess = await verifySessionCached(token);

  if (!sess?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      jlaMemberNumber: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const [qualifications, qualificationTemplates] = await Promise.all([
    prisma.qualification.findMany({
      where: { userId: sess.userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.qualificationTemplate.findMany({
      orderBy: { kind: "asc" },
    }),
  ]);

  const statusLabel = {
    APPROVED: "有効",
    PENDING: "審査中",
    REJECTED: "却下",
    EXPIRED: "期限切れ",
    INCLUDED: "認定ライフセーバーに含む",
  } as const;

  const statusClass = {
    APPROVED:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    PENDING:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    REJECTED:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
    EXPIRED: "border-border bg-muted text-muted-foreground",
    INCLUDED:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  } as const;

  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_\-./()（）・]+/g, "");

  const playerRegistrationKeywords = ["選手登録", "player registration", "player_registration"];
  const blsWsKeywords = ["BLS・WS", "BLS/WS", "BLS WS", "blsws", "bls ws", "ベーシックライフセーバー", "basic lifesaver", "bls"];
  const lifesaverKeywords = ["認定ライフセーバー", "certified lifesaver", "cls"];

  const matchesKeywords = (value: string | null | undefined, keywords: string[]) => {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return false;
    return keywords.some((keyword) => {
      const normalizedKeyword = normalize(keyword);
      return (
        normalizedValue === normalizedKeyword ||
        normalizedValue.includes(normalizedKeyword) ||
        normalizedKeyword.includes(normalizedValue)
      );
    });
  };

  const findTemplateByKeywords = (keywords: string[]) =>
    qualificationTemplates.find(
      (template) =>
        matchesKeywords(template.kind, keywords) ||
        matchesKeywords(template.name, keywords)
    );

  const findOwnedByKeywords = (keywords: string[]) =>
    qualifications.find((q) => matchesKeywords(q.kind, keywords)) ?? null;

  const playerRegistrationTemplate =
    findTemplateByKeywords(playerRegistrationKeywords) ?? {
      id: "default-player-registration",
      kind: "選手登録",
      name: "選手登録",
      description: "全選手が登録可能な基本資格",
      requiresExpiry: true,
      validityMonths: 12,
    };

  const blsWsTemplate =
    findTemplateByKeywords(blsWsKeywords) ?? {
      id: "default-bls-ws",
      kind: "BLS・WS",
      name: "BLS・WS",
      description: "救命・安全に関する基礎資格",
      requiresExpiry: true,
      validityMonths: null,
    };

  const lifesaverTemplate =
    findTemplateByKeywords(lifesaverKeywords) ?? {
      id: "default-certified-lifesaver",
      kind: "認定ライフセーバー",
      name: "認定ライフセーバー",
      description: "上位資格保持者向けの認定資格",
      requiresExpiry: true,
      validityMonths: null,
    };

  const ownedLifesaver = findOwnedByKeywords(lifesaverKeywords);
  const lifesaverExpiryDate = ownedLifesaver?.expiryDate
    ? new Date(ownedLifesaver.expiryDate)
    : null;
  const lifesaverIsExpired =
    !!lifesaverExpiryDate && lifesaverExpiryDate.getTime() < new Date().getTime();
  const isLifesaverEffective =
    !!ownedLifesaver && ownedLifesaver.status === "APPROVED" && !lifesaverIsExpired;

  const registrationQualifications = [
    {
      key: "player",
      template: playerRegistrationTemplate,
      owned: findOwnedByKeywords(playerRegistrationKeywords),
      eligible: true,
    },
    {
      key: "bls-ws",
      template: blsWsTemplate,
      owned: findOwnedByKeywords(blsWsKeywords),
      eligible: true,
      coveredByLifesaver: isLifesaverEffective,
    },
    {
      key: "lifesaver",
      template: lifesaverTemplate,
      owned: ownedLifesaver,
      eligible: true,
    },
  ];

  const isRegistrationKind = (value: string | null | undefined) =>
    matchesKeywords(value, playerRegistrationKeywords) ||
    matchesKeywords(value, blsWsKeywords) ||
    matchesKeywords(value, lifesaverKeywords);

  const isRegistrationTemplate = (template: (typeof qualificationTemplates)[number]) =>
    isRegistrationKind(template.kind) || isRegistrationKind(template.name);

  const isOwnedTemplate = (template: (typeof qualificationTemplates)[number]) =>
    qualifications.some(
      (q) =>
        normalize(q.kind) === normalize(template.kind) ||
        normalize(q.kind) === normalize(template.name)
    );

  const templateByKind = new Map<string, (typeof qualificationTemplates)[number]>();
  for (const template of qualificationTemplates) {
    if (!templateByKind.has(template.kind)) {
      templateByKind.set(template.kind, template);
    }
  }

  const ownedQualifications = qualifications.filter((q) => !isRegistrationKind(q.kind));

  const unownedTemplates = qualificationTemplates.filter(
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
            保有資格の管理
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            登録資格・保有資格・未取得の資格を一覧し、申請状況や講習への導線をまとめています。
          </p>
        </div>
      </header>

      <JlaMemberNumberEditor initialValue={user.jlaMemberNumber} />

      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            <CardTitle className="text-lg">登録資格</CardTitle>
          </div>
          <CardDescription>
            選手登録・BLS・WS・認定ライフセーバーの状況を確認できます。JLAメンバーIDは上の欄で登録すると、選手登録の申請時に自動で反映されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-5 sm:p-6">
          {registrationQualifications.map(({ key, template, owned, coveredByLifesaver }) => {
            const expiryDate = owned?.expiryDate ? new Date(owned.expiryDate) : null;
            const now = new Date();
            const isExpired = !!expiryDate && expiryDate.getTime() < now.getTime();
            const status = owned ? (isExpired ? "EXPIRED" : owned.status) : null;
            const displayStatus = status ?? (coveredByLifesaver ? "INCLUDED" : null);

            return (
              <div
                key={key}
                className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm dark:bg-card/30"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-base font-semibold text-foreground">
                      {template.name ?? template.kind}
                    </h3>
                    {template.description ? (
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:flex lg:shrink-0 lg:gap-8">
                    <div>
                      <p className="font-medium text-muted-foreground">発行日</p>
                      <p className="mt-0.5 tabular-nums text-foreground">
                        {owned?.issueDate ? new Date(owned.issueDate).toLocaleDateString("ja-JP") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">有効期限</p>
                      <p className="mt-0.5 tabular-nums text-foreground">
                        {expiryDate ? expiryDate.toLocaleDateString("ja-JP") : "設定なし"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-start lg:justify-end">
                    {displayStatus ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                          statusClass[displayStatus]
                        )}
                      >
                        {statusLabel[displayStatus]}
                      </span>
                    ) : (
                      <QualificationRegisterButton
                        defaultJlaMemberNumber={user.jlaMemberNumber}
                        item={{
                          id: template.id,
                          kind: template.kind,
                          name: template.name,
                          description: template.description,
                          requiresExpiry: template.requiresExpiry,
                          validityMonths: template.validityMonths,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
              保有資格
            </h2>
            <p className="text-sm text-muted-foreground">発行済みの資格と更新のための講習へのリンクです。</p>
          </div>
        </div>

        {ownedQualifications.length === 0 ? (
          <Card className="border-dashed border-border/90 bg-muted/15">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Award className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">保有資格はまだありません</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                登録資格以外で発行された資格がここに表示されます。
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
          <CardDescription>まだ持っていない資格から、講習会情報へ進めます。</CardDescription>
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
