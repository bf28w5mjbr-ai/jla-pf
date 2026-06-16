import { unstable_cache } from "next/cache";
import { prisma } from "@/server/db";

export type QualificationTemplateLite = {
  id: string;
  name: string;
  kind: string;
};

async function loadQualificationTemplatesUncached(): Promise<QualificationTemplateLite[]> {
  return prisma.qualificationTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true },
  });
}

/** 全大会共通の資格テンプレート（変更頻度が低いためキャッシュ） */
export const getCachedQualificationTemplates = unstable_cache(
  loadQualificationTemplatesUncached,
  ["qualification-templates-all"],
  { revalidate: 3600 }
);
