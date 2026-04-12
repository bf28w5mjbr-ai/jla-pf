import { prisma } from "@/server/db";
import { stripe } from "@/lib/stripe";

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
