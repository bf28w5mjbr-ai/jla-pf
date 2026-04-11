import type { EventCategory, EventType } from "@prisma/client";

/** 同一種目名・個人/団体・プール/オーシャン・年齢カテゴリ内の男女行などをまとめる Prisma where（updateMany / deleteMany 用） */
export function eventSiblingGroupWhere(
  competitionId: string,
  event: {
    name: string;
    type: EventType;
    category: EventCategory;
    ageCategoryId: string | null;
  }
) {
  return {
    competitionId,
    name: event.name,
    type: event.type,
    category: event.category,
    ageCategoryId: event.ageCategoryId,
  } as const;
}

export function birthRangeFormKey(event: {
  name: string;
  ageCategoryId?: string | null;
}): string {
  return `${event.ageCategoryId ?? "__NONE__"}::${event.name}`;
}
