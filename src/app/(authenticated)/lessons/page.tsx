import { Metadata } from "next";
import Link from "next/link";

import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { stripLegacyQualificationTemplateMetaLines } from "@/lib/qualificationTemplateRules";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "資格講習 | Bluvium",
};

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ qualification?: string | string[]; renewal?: string }>;
}) {
  const params = await searchParams;
  const qualificationParams = Array.isArray(params.qualification)
    ? params.qualification
    : params.qualification
      ? [params.qualification]
      : [];
  const filters = qualificationParams.map((v) => v.trim()).filter((v) => v.length > 0);
  const isRenewalOnly = params.renewal === "1" || params.renewal === "true";

  const userId = await getRequiredAuthenticatedUserId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      memberships: {
        select: { role: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const lessons = await prisma.qualificationTemplate.findMany({
    where: {
      ...(filters.length > 0
        ? {
            OR: filters.flatMap((filter) => [
              { kind: { equals: filter, mode: "insensitive" as const } },
              { name: { equals: filter, mode: "insensitive" as const } },
            ]),
          }
        : {}),
      ...(isRenewalOnly ? { requiresExpiry: true } : {}),
    },
    orderBy: { kind: "asc" },
  });

  return (
    
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">資格講習</h1>
          <p className="text-sm text-gray-600">
            資格講習会の案内一覧です。必要な資格で絞り込みができます。
          </p>
          {(filters.length > 0 || isRenewalOnly) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {filters.map((filter) => (
                <span key={filter} className="rounded-full bg-gray-900 px-3 py-1 font-semibold text-white">
                  フィルタ: {filter}
                </span>
              ))}
              {isRenewalOnly && (
                <span className="rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white">
                  更新講習のみ
                </span>
              )}
              <Link
                href="/lessons"
                className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                フィルタ解除
              </Link>
            </div>
          )}
        </div>

        {lessons.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-gray-600">
              該当する講習会は見つかりませんでした。
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {lessons.map((lesson) => {
              const description = stripLegacyQualificationTemplateMetaLines(lesson.description);
              return (
                <Card key={lesson.id} className="space-y-2 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-gray-900">
                      {lesson.name ?? lesson.kind}
                    </h2>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {lesson.kind}
                    </span>
                  </div>
                  {description && (
                    <p className="text-sm text-gray-600">{description}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {lesson.requiresExpiry && lesson.validityMonths
                      ? `有効期間: ${lesson.validityMonths}か月`
                      : "有効期限なし"}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    
  );
}
