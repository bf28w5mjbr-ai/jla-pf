import type { Prisma } from "@prisma/client";

/** 年齢カテゴリの生年月日範囲を種目行に反映するときの data 片（min/max はクリア） */
export function eventBirthFieldsFromAgeCategory(category: {
  eligibleBirthDateFrom: Date | null;
  eligibleBirthDateTo: Date | null;
}): Pick<
  Prisma.EventUpdateManyMutationInput,
  "eligibleBirthDateFrom" | "eligibleBirthDateTo" | "minAge" | "maxAge"
> {
  return {
    eligibleBirthDateFrom: category.eligibleBirthDateFrom,
    eligibleBirthDateTo: category.eligibleBirthDateTo,
    minAge: null,
    maxAge: null,
  };
}
