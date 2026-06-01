import { unstable_cache } from "next/cache";
import { prisma } from "@/server/db";

/** ダッシュボード等で使う資格テンプレート一覧（全ユーザー共通・低更新頻度） */
export async function getCachedQualificationTemplates() {
  return unstable_cache(
    async () =>
      prisma.qualificationTemplate.findMany({
        select: { kind: true, name: true },
        orderBy: { kind: "asc" },
      }),
    ["qualification-templates-labels"],
    { revalidate: 300 }
  )();
}
