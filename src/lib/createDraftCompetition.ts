import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type HostOrganizationSnapshotSource = {
  name: string;
  nameKana: string | null;
  abbreviation: string | null;
};

export type HostOrganizationSnapshot = {
  hostOrganizationName: string;
  hostOrganizationNameKana: string | null;
  hostOrganizationAbbreviation: string | null;
};

export function buildHostOrganizationSnapshot(
  org: HostOrganizationSnapshotSource
): HostOrganizationSnapshot {
  return {
    hostOrganizationName: org.name,
    hostOrganizationNameKana: org.nameKana,
    hostOrganizationAbbreviation: org.abbreviation,
  };
}

export type CreateDraftCompetitionInput = {
  organizationId: string;
  snapshot: HostOrganizationSnapshot;
  name: string;
  nameKana?: string | null;
  description?: string | null;
  category?: string | null;
  startDate: Date;
  endDate: Date;
  venue?: string;
  venueAddress?: string | null;
  entryStartDate?: Date | null;
  entryEndDate?: Date | null;
  maxParticipants?: number | null;
  entryFee?: Prisma.InputJsonValue;
};

export async function createDraftCompetition(
  input: CreateDraftCompetitionInput,
  db: typeof prisma = prisma
) {
  return db.competition.create({
    data: {
      organizationId: input.organizationId,
      hostOrganizationName: input.snapshot.hostOrganizationName,
      hostOrganizationNameKana: input.snapshot.hostOrganizationNameKana,
      hostOrganizationAbbreviation: input.snapshot.hostOrganizationAbbreviation,
      name: input.name,
      nameKana: input.nameKana,
      description: input.description,
      category: input.category,
      startDate: input.startDate,
      endDate: input.endDate,
      venue: input.venue ?? "",
      venueAddress: input.venueAddress,
      entryStartDate: input.entryStartDate,
      entryEndDate: input.entryEndDate,
      maxParticipants: input.maxParticipants,
      entryFee: input.entryFee,
      status: "DRAFT",
      isPublished: false,
    },
  });
}

/** 管理 UI の「新規大会」用デフォルト名・日付 */
export function defaultDraftCompetitionFields(now = new Date()) {
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 1);
  return {
    name: `新規大会 ${now.toLocaleDateString("ja-JP")}`,
    startDate: now,
    endDate,
  };
}
