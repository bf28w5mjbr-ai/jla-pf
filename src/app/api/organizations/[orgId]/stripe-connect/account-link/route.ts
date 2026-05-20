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

/** Stripe が「プラットフォーム側の Connect 設定未完了」で返す文言の検知 */
function isConnectPlatformProfileIncompleteMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("platform-profile") ||
    m.includes("managing losses") ||
    m.includes("responsibilities of managing") ||
    (m.includes("connect") && m.includes("platform profile"))
  );
}

const STRIPE_CONNECT_PLATFORM_PROFILE_URL =
  "https://dashboard.stripe.com/settings/connect/platform-profile";

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
      await requireOrgAdmin(organizationId, session.userId, "operational");
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
      const msg = error.message?.trim() || null;
      const platformProfilePending = isConnectPlatformProfileIncompleteMessage(msg);
      return NextResponse.json(
        {
          error: platformProfilePending
            ? "Stripe の「プラットフォームプロフィール」（紛争・損失の取扱い等）が未完了のため、Connect の本人確認リンクを発行できません。Stripe ダッシュボードで該当画面を開き、表示に沿って最後まで完了してください（テスト／本番は STRIPE_SECRET_KEY のモードに合わせたダッシュボードで操作してください）。"
            : "Stripe Connect の設定を完了できませんでした。Stripe ダッシュボードで Connect が有効か、本番／テストモードがキーと一致しているか確認してください。",
          /** Stripe からの本文（空のことがある）。空でも code / param / type で追える */
          stripeDetail: msg,
          stripeCode: error.code ?? null,
          stripeParam: error.param ?? null,
          stripeType: error.type ?? null,
          /** プラットフォーム側の未完了時のみ。主催者向け案内用 */
          stripeActionUrl: platformProfilePending ? STRIPE_CONNECT_PLATFORM_PROFILE_URL : null,
        },
        { status: 400 }
      );
    }
    return jsonInternalError500(ctx, error);
  }
}
