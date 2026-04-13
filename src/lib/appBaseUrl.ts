/**
 * 公開URL（SMS・メールのリンク生成用）
 */
export function getPublicAppUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.VERCEL_URL;
  if (fromEnv) {
    return fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
  }
  return "http://localhost:3000";
}

/**
 * Stripe（Checkout の戻り先・Connect の refresh/return URL 等）用の正規オリジン。
 * リクエストの Host ではなく {@link getPublicAppUrl} に揃え、本番で Connect と年額 Checkout の戻り先が食い違わないようにする。
 */
export function stripeRedirectOrigin(): string {
  return getPublicAppUrl().replace(/\/$/, "");
}
