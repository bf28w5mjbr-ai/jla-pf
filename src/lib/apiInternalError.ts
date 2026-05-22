import { NextResponse } from "next/server";
import { safeServerErrorLog } from "@/lib/safeServerLog";

/**
 * API の 500 応答を統一する。
 * - 本番ではクライアントに内部詳細を返さない（自動スキャン・LLM による推論の材料を減らす）
 * - サーバー側は safeServerErrorLog（本番ではスタック抑制可）
 */
export function logApiError(
  context: string,
  err: unknown,
  options?: { requestId?: string }
): void {
  safeServerErrorLog(context, err, options);
}

export function jsonInternalError500(
  context: string,
  err: unknown,
  options?: { requestId?: string }
): NextResponse {
  logApiError(context, err, options);
  const body: { error: string; message: string; details?: string } = {
    error: "internal_error",
    message: "サーバーでエラーが発生しました。時間をおいて再度お試しください。",
  };
  if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    body.details = err.message;
  }
  return NextResponse.json(body, { status: 500 });
}
