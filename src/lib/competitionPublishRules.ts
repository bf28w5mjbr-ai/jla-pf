import type { Competition, Event, Organization } from "@prisma/client";

export type CompetitionPublishCheck = Competition & {
  organization: Pick<Organization, "status">;
  events: Pick<Event, "id">[];
};

/**
 * DOMAIN_OPERATIONS_SPEC 6-1: DRAFT -> PUBLISHED の公開条件
 */
export function getCompetitionPublishErrors(c: CompetitionPublishCheck): string[] {
  const errors: string[] = [];

  if (c.organization.status !== "APPROVED") {
    errors.push("大会開催者が正式化（承認）されていないため公開できません。");
  }

  if (!c.name?.trim()) {
    errors.push("大会名が入力されていません。");
  }
  if (!c.venue?.trim()) {
    errors.push("会場が入力されていません。");
  }
  if (!c.startDate || !c.endDate) {
    errors.push("開催日時が入力されていません。");
  }
  if (!c.entryStartDate || !c.entryEndDate) {
    errors.push("エントリー期間の開始と終了を入力してください。");
  }
  if (c.events.length === 0) {
    errors.push("少なくとも1種目を登録してください。");
  }

  return errors;
}
