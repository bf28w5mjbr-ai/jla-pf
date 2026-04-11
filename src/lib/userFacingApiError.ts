/**
 * fetch した API のエラー JSON からユーザー向け文言を得る。
 * `error: "internal_error"` のときはフォールバックを返し、詳細を画面に出さない。
 */
export function userFacingApiErrorMessage(
  data: unknown,
  fallback: string
): string {
  if (!data || typeof data !== "object") return fallback;
  const o = data as Record<string, unknown>;
  const msg = o.message;
  if (typeof msg === "string" && msg.trim()) return msg;
  const err = o.error;
  if (err === "internal_error") return fallback;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}
