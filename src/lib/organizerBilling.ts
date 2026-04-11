import type { OnboardingFeeStatus, OrganizerSubscriptionStatus } from "@prisma/client";

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

/**
 * 参加者からの有料エントリー Checkout を開始できない理由（なければ null）。
 */
export function paidEntryCheckoutBlockReason(org: OrganizerBillingSnapshot): string | null {
  if (!hasOrganizerPlatformSubscription(org)) {
    return "この大会の主催団体のプラットフォーム利用登録が未完了のため、有料エントリーを受け付けできません。主催者にお問い合わせください。";
  }
  if (connectRequirementSkipped()) return null;
  if (!org.stripeConnectAccountId || !org.stripeConnectChargesEnabled) {
    return "主催団体の決済口座（Stripe Connect）の設定が完了していないため、有料エントリーを受け付けできません。主催者にお問い合わせください。";
  }
  return null;
}
