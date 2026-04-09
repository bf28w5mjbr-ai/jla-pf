type SafeServerLogOptions = {
  requestId?: string;
};

function normalizeRequestId(error: unknown, options?: SafeServerLogOptions): string | undefined {
  if (options?.requestId) return options.requestId;
  if (error && typeof error === "object" && "requestId" in error) {
    const candidate = (error as { requestId?: unknown }).requestId;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * サーバ側エラーログ。本番ではスタックや付随データを抑え、ログ基盤への個人情報混入リスクを下げる。
 * 障害調査でスタックが必要なときは一時的に LOG_FULL_ERROR_STACK=true を設定する。
 */
export function safeServerErrorLog(
  scope: string,
  error: unknown,
  options?: SafeServerLogOptions
): void {
  const requestId = normalizeRequestId(error, options);
  const scopeWithRequest = requestId ? `${scope} [request_id=${requestId}]` : scope;

  if (error instanceof Error) {
    if (process.env.NODE_ENV === "production" && process.env.LOG_FULL_ERROR_STACK !== "true") {
      console.error(`${scopeWithRequest}:`, error.name, error.message);
      return;
    }
    console.error(`${scopeWithRequest}:`, error);
    return;
  }
  console.error(`${scopeWithRequest}:`, error);
}
