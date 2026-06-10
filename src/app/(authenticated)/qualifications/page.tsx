import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { SettingsEditorialSection } from "@/app/(authenticated)/settings/_components/SettingsEditorialSection";
import { verifySessionCached } from "@/lib/auth";
import { resolveQualificationTemplateMeta } from "@/lib/qualificationTemplateRules";
import { prisma } from "@/server/db";
import { cn } from "@/lib/utils";
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
        prerequisiteKinds: true,
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
        templateId: true,
        recordOrigin: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: sess.userId },
      select: { jlaProfile: { select: { jlaMemberNumber: true } } },
    }),
  ]);

  const templates = rawTemplates.map((template) => ({
    ...template,
    name: template.name?.trim() || template.kind,
    ...resolveQualificationTemplateMeta(template),
  }));
  const linkedTemplateIds = linkedQualifications.map((q) => q.templateId);
  const lockedTemplateIds = linkedQualifications
    .filter((q) => q.recordOrigin === "ASSOCIATION_IMPORT")
    .map((q) => q.templateId);

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">資格一覧から選択</h1>

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-0 pt-10 sm:pt-12"
        )}
      >
        <Link
          href="/dashboard"
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
          ダッシュボードに戻る
        </Link>
      </section>

      <SettingsEditorialSection
        label="Qualifications"
        title="資格一覧から選択"
        contentClassName="space-y-5"
        className="border-t-0 pt-8 sm:pt-10"
      >
        {templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">表示できる資格がありません。</p>
          </div>
        ) : (
          <QualificationsSelectionClient
            templates={templates}
            linkedTemplateIds={linkedTemplateIds}
            lockedTemplateIds={lockedTemplateIds}
            initialJlaMemberNumber={user?.jlaProfile?.jlaMemberNumber ?? null}
          />
        )}
      </SettingsEditorialSection>
    </div>
  );
}
