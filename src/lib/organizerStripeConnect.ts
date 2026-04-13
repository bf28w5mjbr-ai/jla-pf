import Stripe from "stripe";
import { prisma } from "@/server/db";
import { stripe } from "@/lib/stripe";

/** API や管理 UI に返してよい Connect アカウントの要約（機微は含めない） */
export type StripeConnectAccountSummary = {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  /** 追加提出が必要な要件の件数 */
  currentlyDueCount: number;
  /** Stripe 側の無効理由（あれば） */
  disabledReason: string | null;
  cardPaymentsStatus: string | null;
  transfersStatus: string | null;
};

export async function retrieveStripeConnectAccountSummary(
  connectAccountId: string
): Promise<
  | { ok: true; summary: StripeConnectAccountSummary }
  | { ok: false; message: string; stripeCode?: string }
> {
  try {
    const account = await stripe.accounts.retrieve(connectAccountId);
    const cap = account.capabilities ?? {};
    const capStr = (v: unknown) => (v != null && v !== "" ? String(v) : null);
    return {
      ok: true,
      summary: {
        accountId: account.id,
        chargesEnabled: account.charges_enabled === true,
        detailsSubmitted: account.details_submitted === true,
        payoutsEnabled: account.payouts_enabled === true,
        currentlyDueCount: account.requirements?.currently_due?.length ?? 0,
        disabledReason: account.requirements?.disabled_reason ?? null,
        cardPaymentsStatus: capStr(cap.card_payments),
        transfersStatus: capStr(cap.transfers),
      },
    };
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      return { ok: false, message: e.message, stripeCode: e.code };
    }
    return { ok: false, message: e instanceof Error ? e.message : "stripe_retrieve_failed" };
  }
}

export async function refreshOrganizationStripeConnectFlags(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectAccountId: true },
  });
  if (!org?.stripeConnectAccountId) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeConnectChargesEnabled: false },
    });
    return;
  }
  try {
    const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeConnectChargesEnabled: account.charges_enabled === true },
    });
  } catch (e) {
    console.error(
      "[refreshOrganizationStripeConnectFlags] Stripe retrieve/update failed",
      { organizationId, stripeConnectAccountId: org.stripeConnectAccountId },
      e
    );
  }
}

export async function ensureStripeExpressConnectAccount(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      stripeConnectAccountId: true,
    },
  });
  if (!org) throw new Error("organization_not_found");
  if (org.stripeConnectAccountId) return org.stripeConnectAccountId;

  const account = await stripe.accounts.create({
    type: "express",
    country: "JP",
    email: org.email?.trim() || undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: org.name.slice(0, 100),
    },
    metadata: {
      organizationId: org.id,
    },
  });

  if (!account.id) throw new Error("stripe_connect_create_failed");

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeConnectAccountId: account.id, stripeConnectChargesEnabled: false },
  });

  return account.id;
}
