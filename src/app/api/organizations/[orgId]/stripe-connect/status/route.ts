import type { OnboardingFeeStatus, OrganizerSubscriptionStatus } from "@prisma/client";
import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import {
  connectRequirementSkipped,
  hasOrganizerPlatformSubscription,
  paidEntryCheckoutBlockReason,
} from "@/lib/organizerBilling";
import {
  refreshOrganizationStripeConnectFlags,
  retrieveStripeConnectAccountSummary,
  type StripeConnectAccountSummary,
} from "@/lib/organizerStripeConnect";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ orgId: string }> };

function buildIssues(
  org: {
    stripeConnectAccountId: string | null;
    stripeConnectChargesEnabled: boolean;
    onboardingFeeStatus: OnboardingFeeStatus;
    organizerSubscriptionStatus: OrganizerSubscriptionStatus;
  },
  stripe: StripeConnectAccountSummary | null,
  stripeRetrieveError: string | null,
  dbChargesAfterSync: boolean
): string[] {
  const issues: string[] = [];
  if (!hasOrganizerPlatformSubscription(org)) {
    issues.push("プラットフォーム利用登録（年額サブスク等）が未完了です。");
  }
  if (connectRequirementSkipped()) {
    issues.push(
      "STRIPE_CONNECT_SKIP_REQUIREMENT=true のため、Connect 未完了でも有料エントリーが通る設定になっています。"
    );
  }
  if (stripeRetrieveError) {
    issues.push(`Stripe からアカウント情報を取得できませんでした: ${stripeRetrieveError}`);
    return issues;
  }
  if (!org.stripeConnectAccountId) {
    issues.push("Connect アカウントが未作成です。「口座・本人確認を行う」から作成してください。");
    return issues;
  }
  if (stripe && !stripe.chargesEnabled) {
    issues.push("Stripe 上で決済受付（charges_enabled）がまだ有効ではありません。オンボードを完了してください。");
  }
  if (stripe && stripe.currentlyDueCount > 0) {
    issues.push(`追加提出が必要な要件が Stripe 上で ${stripe.currentlyDueCount} 件あります。`);
  }
  if (stripe?.disabledReason) {
    issues.push(`Stripe 側の無効理由: ${stripe.disabledReason}`);
  }
  if (stripe && dbChargesAfterSync !== stripe.chargesEnabled) {
    issues.push(
      "DB の charges フラグと Stripe の charges_enabled が一致しません（sync 後も差がある場合は Webhook や Stripe ダッシュボードを確認）。"
    );
  }
  return issues;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { orgId: organizationId } = await context.params;
    const token = request.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const sync = request.nextUrl.searchParams.get("sync") === "1";
    if (sync) {
      await refreshOrganizationStripeConnectFlags(organizationId);
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        onboardingFeeStatus: true,
        organizerSubscriptionStatus: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
      },
    });
    if (!org) {
      return NextResponse.json({ error: "団体が見つかりません" }, { status: 404 });
    }

    let stripe: StripeConnectAccountSummary | null = null;
    let stripeRetrieveError: string | null = null;
    if (org.stripeConnectAccountId) {
      const r = await retrieveStripeConnectAccountSummary(org.stripeConnectAccountId);
      if (r.ok) stripe = r.summary;
      else stripeRetrieveError = r.message;
    }

    const billingSnapshot = {
      onboardingFeeStatus: org.onboardingFeeStatus,
      organizerSubscriptionStatus: org.organizerSubscriptionStatus,
      stripeConnectAccountId: org.stripeConnectAccountId,
      stripeConnectChargesEnabled: org.stripeConnectChargesEnabled,
    };
    const paidEntryBlockReason = paidEntryCheckoutBlockReason(billingSnapshot);
    const issues = buildIssues(org, stripe, stripeRetrieveError, org.stripeConnectChargesEnabled);

    return NextResponse.json({
      organizationId: org.id,
      organizationName: org.name,
      syncApplied: sync,
      connectRequirementSkipped: connectRequirementSkipped(),
      hasPlatformSubscription: hasOrganizerPlatformSubscription(org),
      db: {
        stripeConnectAccountId: org.stripeConnectAccountId,
        stripeConnectChargesEnabled: org.stripeConnectChargesEnabled,
        onboardingFeeStatus: org.onboardingFeeStatus,
        organizerSubscriptionStatus: org.organizerSubscriptionStatus,
      },
      stripe,
      stripeRetrieveError,
      paidEntryBlockReason,
      issues,
      readyForPaidEntries: paidEntryBlockReason === null,
    });
  } catch (error) {
    return jsonInternalError500("GET api/organizations/[orgId]/stripe-connect/status/route.ts", error);
  }
}
