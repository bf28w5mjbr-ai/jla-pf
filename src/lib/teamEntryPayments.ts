/** チーム種目エントリー費の Payment.ownerId（1クラブ1件） */
export function buildTeamEntryPaymentOwnerId(competitionId: string, clubId: string) {
  return `competition-team-entry:${competitionId}:${clubId}`;
}

/** クラブによる個人エントリー先払い分の Payment.ownerId（チーム請求と分離） */
export function buildClubPrepaidIndividualPaymentOwnerId(competitionId: string, clubId: string) {
  return `competition-club-prepaid-individual:${competitionId}:${clubId}`;
}

export const TEAM_ENTRY_BILLING_SCOPE = "TEAM_ENTRY" as const;
export const CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE = "CLUB_PREPAID_INDIVIDUAL" as const;

export const MUTABLE_TEAM_ENTRY_PAYMENT_STATUSES = ["PENDING", "FAILED", "EXPIRED"] as const;
export const SETTLED_TEAM_ENTRY_PAYMENT_STATUSES = [
  "SUCCEEDED",
  "REFUNDED",
  "DISPUTED",
] as const;

export type TeamBillingCheckoutScope = "team" | "prepaid";
export type SettledTeamEntryPaymentStatus = (typeof SETTLED_TEAM_ENTRY_PAYMENT_STATUSES)[number];

export function isSettledTeamEntryPaymentStatus(
  status?: string | null
): status is SettledTeamEntryPaymentStatus {
  return SETTLED_TEAM_ENTRY_PAYMENT_STATUSES.some((s) => s === status);
}

/** チーム請求またはクラブ個人枠請求の一覧表示用スナップショット */
export type ClubTeamEntryFeeBillingSnapshot = {
  id: string;
  status: string;
  amount: number;
  stripeCheckoutSessionId: string | null;
  finalizedAt: string | null;
};

export type ClubTeamAndPrepaidBillingPair = {
  team?: ClubTeamEntryFeeBillingSnapshot;
  prepaid?: ClubTeamEntryFeeBillingSnapshot;
};

export function isClubPrepaidIndividualPaymentOwnerId(ownerId: string): boolean {
  return ownerId.startsWith("competition-club-prepaid-individual:");
}

export function parseTeamEntryPaymentMetadata(value: unknown): {
  finalizedAt: string | null;
  finalizedByUserId: string | null;
  teamCount: number | null;
  unitPrice: number | null;
  prepaidIndividualSubtotalYen: number | null;
  clubIndividualBillingTiming: string | null;
  scope: string | null;
} {
  if (!value || typeof value !== "object") {
    return {
      finalizedAt: null,
      finalizedByUserId: null,
      teamCount: null,
      unitPrice: null,
      prepaidIndividualSubtotalYen: null,
      clubIndividualBillingTiming: null,
      scope: null,
    };
  }

  const record = value as Record<string, unknown>;
  const prepaidRaw = record.prepaidIndividualSubtotalYen;
  const scopeRaw = record.scope;
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
    scope: typeof scopeRaw === "string" ? scopeRaw : null,
  };
}

/**
 * Stripe 成功後に先払い枠の有効化などをしてよい Payment か。
 * 個人枠専用 ownerId、または旧1件合算（チーム ownerId かつ metadata に個人分小計あり）のとき true。
 */
export function shouldApplyClubPrepaidStripeSideEffects(payment: {
  ownerId: string;
  metadata: unknown;
}): boolean {
  if (isClubPrepaidIndividualPaymentOwnerId(payment.ownerId)) return true;
  const meta = parseTeamEntryPaymentMetadata(payment.metadata);
  return (
    meta.prepaidIndividualSubtotalYen != null &&
    meta.prepaidIndividualSubtotalYen > 0 &&
    meta.scope !== CLUB_PREPAID_INDIVIDUAL_BILLING_SCOPE
  );
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
