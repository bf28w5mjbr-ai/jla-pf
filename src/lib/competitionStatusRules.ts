import { CompetitionStatus } from "@prisma/client";

export type StatusTransitionResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const ALLOWED_TRANSITIONS: Record<CompetitionStatus, CompetitionStatus[]> = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["DRAFT", "ONGOING", "CANCELLED"],
  ONGOING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isCompetitionStatus(value: unknown): value is CompetitionStatus {
  return typeof value === "string" && Object.values(CompetitionStatus).includes(value as CompetitionStatus);
}

export function validateCompetitionStatusTransition(
  current: CompetitionStatus,
  next: CompetitionStatus
): StatusTransitionResult {
  if (current === next) {
    return { ok: true };
  }

  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    return {
      ok: false,
      code: "INVALID_STATUS_TRANSITION",
      message: `ステータス遷移が不正です: ${current} -> ${next}`,
    };
  }

  return { ok: true };
}
