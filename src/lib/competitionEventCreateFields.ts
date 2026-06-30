import type { EventType, Prisma } from "@prisma/client";
import {
  parseAllowedAgeCategoryIds,
  validateAllowedAgeCategoryIdsAgainstCompetition,
} from "@/lib/competitionEventAgeEligibility";
import { parseEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";

export type EventCreateEligibilityData = {
  ageCategoryId: string | null;
  allowedAgeCategoryIds?: Prisma.InputJsonValue;
  eligibleBirthDateFrom?: Date | null;
  eligibleBirthDateTo?: Date | null;
  minAge?: null;
  maxAge?: null;
};

export type EventCreateTeamData = {
  teamRelayPositionCount?: number | null;
  teamRelayPositionNames?: Prisma.InputJsonValue;
  maxTeamEntriesPerClub?: number | null;
};

function parseTeamRelayNamesInput(v: unknown): string[] | "invalid" {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return "invalid";
}

function parseOptionalPositiveInt(
  v: unknown,
  min: number,
  max: number,
  fieldLabel: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (v === null || v === undefined || v === "") {
    return { ok: true, value: null };
  }
  let n: number;
  if (typeof v === "number" && Number.isInteger(v)) {
    n = v;
  } else if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    n = parseInt(v.trim(), 10);
  } else {
    return {
      ok: false,
      message: `${fieldLabel}は${min}〜${max}の整数、または未設定（空）にしてください`,
    };
  }
  if (n < min || n > max) {
    return {
      ok: false,
      message: `${fieldLabel}は${min}〜${max}の範囲で指定してください`,
    };
  }
  return { ok: true, value: n };
}

/** POST 作成時の参加条件（年齢カテゴリ明示リスト or 生年月日） */
export function resolveEventCreateEligibility(params: {
  body: Record<string, unknown>;
  targetAgeCategoryId: string | null;
  validCategoryIds: ReadonlySet<string>;
}): { ok: true; data: EventCreateEligibilityData } | { ok: false; message: string } {
  const { body, targetAgeCategoryId, validCategoryIds } = params;

  const hasBirthFrom = Object.prototype.hasOwnProperty.call(body, "eligibleBirthDateFrom");
  const hasBirthTo = Object.prototype.hasOwnProperty.call(body, "eligibleBirthDateTo");
  if (hasBirthFrom !== hasBirthTo) {
    return {
      ok: false,
      message:
        "参加可能な生年月日を指定する場合は、eligibleBirthDateFrom と eligibleBirthDateTo の両方を送信してください（未設定は null）。",
    };
  }

  const hasAllowedKey = Object.prototype.hasOwnProperty.call(body, "allowedAgeCategoryIds");

  if (targetAgeCategoryId) {
    if (hasBirthFrom && hasBirthTo) {
      return {
        ok: false,
        message: "年齢カテゴリタブの種目では生年月日レンジと allowedAgeCategoryIds を同時に指定できません",
      };
    }

    let allowedIds: string[];
    if (hasAllowedKey) {
      const parsed = parseAllowedAgeCategoryIds(body.allowedAgeCategoryIds);
      if (!parsed) {
        return { ok: false, message: "参加可能な年齢カテゴリを1件以上選んでください" };
      }
      const validated = validateAllowedAgeCategoryIdsAgainstCompetition(
        parsed,
        validCategoryIds
      );
      if (!validated.ok) return validated;
      allowedIds = validated.ids;
    } else {
      allowedIds = [targetAgeCategoryId];
    }

    return {
      ok: true,
      data: {
        ageCategoryId: targetAgeCategoryId,
        allowedAgeCategoryIds: allowedIds,
        eligibleBirthDateFrom: null,
        eligibleBirthDateTo: null,
        minAge: null,
        maxAge: null,
      },
    };
  }

  if (hasAllowedKey) {
    const parsed = parseAllowedAgeCategoryIds(body.allowedAgeCategoryIds);
    if (parsed) {
      const validated = validateAllowedAgeCategoryIdsAgainstCompetition(
        parsed,
        validCategoryIds
      );
      if (!validated.ok) return validated;
      return {
        ok: true,
        data: {
          ageCategoryId: null,
          allowedAgeCategoryIds: validated.ids,
          eligibleBirthDateFrom: null,
          eligibleBirthDateTo: null,
          minAge: null,
          maxAge: null,
        },
      };
    }
  }

  if (hasBirthFrom && hasBirthTo) {
    let fromD: Date | null;
    let toD: Date | null;
    try {
      fromD = parseEligibleBirthDateInput(body.eligibleBirthDateFrom);
      toD = parseEligibleBirthDateInput(body.eligibleBirthDateTo);
    } catch {
      return {
        ok: false,
        message: "参加可能な生年月日は YYYY-MM-DD 形式で指定してください（解除する場合は null）。",
      };
    }
    if (fromD && toD && fromD.getTime() > toD.getTime()) {
      return {
        ok: false,
        message: "生年月日の開始は終了以前の日付にしてください。",
      };
    }
    const hasRange = Boolean(fromD || toD);
    return {
      ok: true,
      data: {
        ageCategoryId: null,
        eligibleBirthDateFrom: fromD,
        eligibleBirthDateTo: toD,
        ...(hasRange ? { minAge: null, maxAge: null } : {}),
      },
    };
  }

  return {
    ok: true,
    data: { ageCategoryId: null },
  };
}

/** POST 作成時のチーム種目フィールド */
export function parseEventCreateTeamFields(
  body: Record<string, unknown>,
  eventType: EventType
): { ok: true; data: EventCreateTeamData } | { ok: false; message: string } {
  const hasCount = Object.prototype.hasOwnProperty.call(body, "teamRelayPositionCount");
  const hasNames = Object.prototype.hasOwnProperty.call(body, "teamRelayPositionNames");
  const hasMax = Object.prototype.hasOwnProperty.call(body, "maxTeamEntriesPerClub");

  if (!hasCount && !hasNames && !hasMax) {
    return { ok: true, data: {} };
  }

  if (eventType !== "TEAM") {
    return { ok: false, message: "個人種目ではチーム用の設定を指定できません" };
  }

  const data: EventCreateTeamData = {};

  if (hasCount || hasNames) {
    let count: number | null = null;
    if (hasCount) {
      const parsedCount = parseOptionalPositiveInt(
        body.teamRelayPositionCount,
        1,
        32,
        "ポジション数"
      );
      if (!parsedCount.ok) return parsedCount;
      count = parsedCount.value;
    }

    let names: string[] = [];
    if (hasNames) {
      const parsedNames = parseTeamRelayNamesInput(body.teamRelayPositionNames);
      if (parsedNames === "invalid") {
        return { ok: false, message: "ポジション名は文字列の配列で指定してください" };
      }
      names = parsedNames;
    }

    if (hasCount && count === null) {
      if (names.length > 0) {
        return {
          ok: false,
          message: "ポジション数を指定しない場合はポジション名も空にしてください",
        };
      }
      data.teamRelayPositionCount = null;
      data.teamRelayPositionNames = [];
    } else if (hasCount && count !== null) {
      if (hasNames && names.length !== count) {
        return {
          ok: false,
          message: `ポジション名は${count}件（ポジション数と同じ行数）にしてください`,
        };
      }
      data.teamRelayPositionCount = count;
      if (hasNames) {
        data.teamRelayPositionNames = names;
      }
    } else if (hasNames && names.length > 0) {
      data.teamRelayPositionCount = names.length;
      data.teamRelayPositionNames = names;
    }
  }

  if (hasMax) {
    const parsedMax = parseOptionalPositiveInt(
      body.maxTeamEntriesPerClub,
      1,
      999,
      "同一クラブあたりのチーム上限"
    );
    if (!parsedMax.ok) return parsedMax;
    data.maxTeamEntriesPerClub = parsedMax.value;
  }

  return { ok: true, data };
}
