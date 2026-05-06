import type {
  CompetitionStripeSettlementAccountType,
  OnboardingFeeStatus,
  OrganizerSubscriptionStatus,
} from "@prisma/client";

export type OrganizerBillingSnapshot = {
  onboardingFeeStatus: OnboardingFeeStatus;
  organizerSubscriptionStatus: OrganizerSubscriptionStatus;
  stripeConnectAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
};

export function hasOrganizerPlatformSubscription(org: {
  onboardingFeeStatus: OnboardingFeeStatus;
  organizerSubscriptionStatus: OrganizerSubscriptionStatus;
}): boolean {
  if (org.organizerSubscriptionStatus === "ACTIVE") return true;
  /** 過去の一回払い登録料のみの主催団体 */
  if (org.onboardingFeeStatus === "PAID") return true;
  return false;
}

export function connectRequirementSkipped(): boolean {
  return process.env.STRIPE_CONNECT_SKIP_REQUIREMENT === "true";
}

export type PaidEntryCheckoutConnectOptions = {
  /** 未指定時は従来どおり主催団体 Connect 必須 */
  stripeSettlementAccountType?: CompetitionStripeSettlementAccountType;
};

/**
 * 参加者からの有料エントリー Checkout を開始できない理由（なければ null）。
 */
export function paidEntryCheckoutBlockReason(
  org: OrganizerBillingSnapshot,
  options?: PaidEntryCheckoutConnectOptions
): string | null {
  if (!hasOrganizerPlatformSubscription(org)) {
    return "この大会の主催団体のプラットフォーム利用登録が未完了のため、有料エントリーを受け付けできません。主催者にお問い合わせください。";
  }
  if (connectRequirementSkipped()) return null;
  const settlement = options?.stripeSettlementAccountType ?? "ORGANIZER_CONNECT";
  if (settlement === "PLATFORM") {
    return null;
  }
  if (!org.stripeConnectAccountId || !org.stripeConnectChargesEnabled) {
    return "主催団体の決済口座（Stripe Connect）の設定が完了していないため、有料エントリーを受け付けできません。主催者にお問い合わせください。";
  }
  return null;
}

/**
 * 大会の決済口座モードと団体の Connect 状態に応じて、Stripe Checkout の Connect パラメータを決める。
 * - PLATFORM かつ Connect 未整備: プラットフォーム口座のみ（送金先なし）。
 * - PLATFORM かつ Connect 整備済み: 送金先は主催団体（審査完了後の自動送金と同じ）。
 * - ORGANIZER_CONNECT: 常に主催団体へ送金（呼び出し元で Connect 必須を満たしていること）。
 */
export function resolveEntryCheckoutStripeConnectParams(args: {
  skipConnectEnv: boolean;
  stripeSettlementAccountType: CompetitionStripeSettlementAccountType;
  org: OrganizerBillingSnapshot | null;
  applicationFeeWithProcessing: number;
}): { destinationConnectAccountId: string | null; applicationFeeAmountYen: number | null } {
  if (args.skipConnectEnv || !args.org) {
    return { destinationConnectAccountId: null, applicationFeeAmountYen: null };
  }

  const orgReady =
    Boolean(args.org.stripeConnectAccountId?.trim()) && args.org.stripeConnectChargesEnabled === true;

  if (args.stripeSettlementAccountType === "PLATFORM") {
    if (orgReady) {
      return {
        destinationConnectAccountId: args.org.stripeConnectAccountId!.trim(),
        applicationFeeAmountYen: args.applicationFeeWithProcessing,
      };
    }
    return { destinationConnectAccountId: null, applicationFeeAmountYen: null };
  }

  return {
    destinationConnectAccountId: args.org.stripeConnectAccountId?.trim() ?? null,
    applicationFeeAmountYen: args.applicationFeeWithProcessing,
  };
}
