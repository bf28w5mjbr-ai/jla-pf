import { jsonInternalError500, logApiError } from "@/lib/apiInternalError";
import { stripeRedirectOrigin } from "@/lib/appBaseUrl";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { stripe } from "@/lib/stripe";
import { ensureStripeExpressConnectAccount } from "@/lib/organizerStripeConnect";
import {
  getClientIpFromRequest,
  isStripeCheckoutClientIpBlocked,
  STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE,
} from "@/lib/stripeCheckoutGuards";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId: organizationId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId);
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const clientIp = getClientIpFromRequest(req);
    if (isStripeCheckoutClientIpBlocked(clientIp)) {
      return NextResponse.json(
        { error: STRIPE_CHECKOUT_CLIENT_FAILURE_MESSAGE },
        { status: 403 }
      );
    }

    const accountId = await ensureStripeExpressConnectAccount(organizationId);
    const origin = stripeRedirectOrigin();

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/organizations/${organizationId}?stripe_connect=refresh`,
      return_url: `${origin}/organizations/${organizationId}?stripe_connect=return`,
      type: "account_onboarding",
    });

    if (!link.url) {
      return NextResponse.json({ error: "Stripe のリンクを取得できませんでした" }, { status: 502 });
    }

    return NextResponse.json({ url: link.url });
  } catch (error) {
    const ctx = "POST api/organizations/[orgId]/stripe-connect/account-link/route.ts";
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      logApiError(ctx, error);
      return NextResponse.json(
        {
          error:
            "Stripe の API キーが無効か未設定です。サーバーの STRIPE_SECRET_KEY を確認してください。",
        },
        { status: 503 }
      );
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      logApiError(ctx, error);
      return NextResponse.json(
        {
          error:
            "Stripe Connect の設定を完了できませんでした。Stripe ダッシュボードで Connect が有効か、本番／テストモードがキーと一致しているか確認してください。",
        },
        { status: 400 }
      );
    }
    return jsonInternalError500(ctx, error);
  }
}
