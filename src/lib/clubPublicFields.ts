import type { Prisma } from "@prisma/client";

/** 一般公開 API・ページで返してよいクラブフィールド（氏名・連絡先・住所詳細は含めない） */
export const clubPublicSelect = {
  id: true,
  name: true,
  nameKana: true,
  abbreviation: true,
  logoUrl: true,
  type: true,
  isLifesavingClub: true,
  patrolLocation: true,
  establishedYear: true,
  websiteUrl: true,
  officePrefecture: true,
  officeCity: true,
} satisfies Prisma.ClubSelect;

export type ClubPublicRecord = Prisma.ClubGetPayload<{ select: typeof clubPublicSelect }>;

export const clubPublicListWhere = {
  status: "APPROVED" as const,
};

export function clubPublicLocationLabel(club: Pick<ClubPublicRecord, "officePrefecture" | "officeCity">) {
  return [club.officePrefecture, club.officeCity].filter(Boolean).join("");
}

const CLUB_TYPE_LABELS: Record<string, string> = {
  FIRST: "第1種クラブ",
  SECOND: "第2種クラブ",
  THIRD: "第3種クラブ",
  FOURTH: "第4種クラブ",
};

export function clubPublicTypeLabel(club: Pick<ClubPublicRecord, "type" | "isLifesavingClub">) {
  if (club.isLifesavingClub) return "ライフセービングクラブ";
  if (club.type && CLUB_TYPE_LABELS[club.type]) {
    return CLUB_TYPE_LABELS[club.type];
  }
  return club.type ? String(club.type) : null;
}
