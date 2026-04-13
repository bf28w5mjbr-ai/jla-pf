import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifySessionCached } from "@/lib/auth";
import { parseQualificationTemplateMeta } from "@/lib/qualificationTemplateRules";
import { prisma } from "@/server/db";
import QualificationsSelectionClient from "./QualificationsSelectionClient";

export const metadata: Metadata = {
  title: "資格選択 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function QualificationsSelectPage() {
  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const [rawTemplates, linkedQualifications, user] = await Promise.all([
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
    prisma.qualification.findMany({
      where: {
        userId: sess.userId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: {
        kind: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: sess.userId },
      select: { jlaMemberNumber: true },
    }),
  ]);

  const templates = rawTemplates.map((template) => ({
    ...template,
    name: template.name?.trim() || template.kind,
    ...parseQualificationTemplateMeta(template.description),
  }));
  const linkedKinds = linkedQualifications.map((q) => q.kind);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-9 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            ダッシュボードに戻る
          </Link>
        </Button>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <ListChecks className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium">資格選択</span>
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            資格一覧から選択
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            必要な資格を複数選択して、対象の講習一覧を表示できます。
          </p>
        </div>
      </header>

      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/25">
          <CardTitle className="text-lg">資格一覧</CardTitle>
          <CardDescription>保有している資格にチェックを入れ、保存するとアカウントにすぐ反映されます。</CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          {templates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              表示できる資格がありません。
            </p>
          ) : (
            <QualificationsSelectionClient
              templates={templates}
              linkedKinds={linkedKinds}
              initialJlaMemberNumber={user?.jlaMemberNumber ?? null}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
