export function buildTeamEntryPaymentOwnerId(competitionId: string, clubId: string) {
  return `competition-team-entry:${competitionId}:${clubId}`;
}

export function parseTeamEntryPaymentMetadata(value: unknown): {
  finalizedAt: string | null;
  finalizedByUserId: string | null;
  teamCount: number | null;
  unitPrice: number | null;
  prepaidIndividualSubtotalYen: number | null;
  clubIndividualBillingTiming: string | null;
} {
  if (!value || typeof value !== "object") {
    return {
      finalizedAt: null,
      finalizedByUserId: null,
      teamCount: null,
      unitPrice: null,
      prepaidIndividualSubtotalYen: null,
      clubIndividualBillingTiming: null,
    };
  }

  const record = value as Record<string, unknown>;
  const prepaidRaw = record.prepaidIndividualSubtotalYen;
  return {
    finalizedAt: typeof record.finalizedAt === "string" ? record.finalizedAt : null,
    finalizedByUserId:
      typeof record.finalizedByUserId === "string" ? record.finalizedByUserId : null,
    teamCount: typeof record.teamCount === "number" ? record.teamCount : null,
    unitPrice: typeof record.unitPrice === "number" ? record.unitPrice : null,
    prepaidIndividualSubtotalYen:
      typeof prepaidRaw === "number" && Number.isFinite(prepaidRaw) ? prepaidRaw : null,
    clubIndividualBillingTiming:
      typeof record.clubIndividualBillingTiming === "string"
        ? record.clubIndividualBillingTiming
        : null,
  };
}

export function getTeamPaymentStatusLabel(status?: string | null) {
  switch (status) {
    case "SUCCEEDED":
      return "請求済み";
    case "REFUNDED":
      return "返金済み";
    case "FAILED":
      return "請求失敗";
    case "EXPIRED":
      return "期限切れ";
    case "DISPUTED":
      return "要確認";
    case "PENDING":
    default:
      return "未払い";
  }
}
