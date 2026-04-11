import { z } from "zod";

export type ZodErrorApiStyle = "message" | "validation_error" | "validation_message_ja";

/**
 * Zod 422/400 用レスポンス。本番では details を返さずスキーマ構造の露出を防ぐ。
 */
export function zodErrorJsonBody(error: z.ZodError, style: ZodErrorApiStyle = "message") {
  const body: Record<string, unknown> =
    style === "validation_error"
      ? { error: "validation_error" }
      : style === "validation_message_ja"
        ? { error: "バリデーションエラー" }
        : { error: "入力内容に誤りがあります" };
  if (process.env.NODE_ENV !== "production") {
    body.details = error.errors;
  }
  return body;
}

/**
 * safeParse 失敗時など flatten() を使う API 向け。本番では details を返さない。
 */
export function zodFlattenJsonBody(
  error: z.ZodError,
  opts?: { message?: string }
) {
  const body: Record<string, unknown> = { error: opts?.message ?? "入力が不正です" };
  if (process.env.NODE_ENV !== "production") {
    body.details = error.flatten();
  }
  return body;
}
