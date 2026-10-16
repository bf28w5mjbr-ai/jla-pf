/**
 * 資格審査のサーバー専用設定。
 * ファイルから .env を読まず、呼び出し時点の process.env のみ見る。
 * 未設定・空・不正なら null（協会審査は Fail Closed）。
 */

export const QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV = "QUALIFICATION_REVIEW_ASSOCIATION_ID";
export const QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV = "QUALIFICATION_REVIEW_TEMPLATE_IDS";

export const JLA_ASSOCIATION_CANONICAL_NAME = "日本ライフセービング協会";

export type QualificationReviewConfig = {
  associationId: string;
  templateIds: readonly string[];
};

export function parseQualificationReviewConfig(
  env: NodeJS.Dict<string | undefined> = process.env
): QualificationReviewConfig | null {
  const associationId = typeof env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] === "string"
    ? env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV].trim()
    : "";
  const templatesRaw = env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];

  if (!associationId) return null;
  if (typeof templatesRaw !== "string" || templatesRaw.trim() === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(templatesRaw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const templateIds: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") return null;
    const id = item.trim();
    if (!id) return null;
    templateIds.push(id);
  }

  return { associationId, templateIds };
}

export function isTemplateIdInReviewAllowlist(
  templateId: string,
  templateIds: readonly string[]
): boolean {
  return templateIds.includes(templateId);
}
