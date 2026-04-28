import { normalizeQualificationKind } from "@/lib/qualificationTemplateRules";

/**
 * normalizeQualificationKind 後の部分一致は、短いトークンが長い kind の接頭辞になると誤爆する（例: bls ⊂ blsassistantinstructor）。
 */
export function keywordMatchesNorm(normalizedValue: string, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return false;
  if (normalizedValue === normalizedKeyword) return true;
  if (normalizedValue.length <= 3 || normalizedKeyword.length <= 3) {
    return false;
  }
  return (
    normalizedValue.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedValue)
  );
}

/** 資格テンプレート解決・API 検証で共通のキーワード照合（POST / PUT 資格同期など） */
export function matchesQualificationKeywords(
  value: string | null | undefined,
  keywords: string[]
): boolean {
  const normalizedValue = normalizeQualificationKind(value);
  if (!normalizedValue) return false;
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeQualificationKind(keyword);
    return keywordMatchesNorm(normalizedValue, normalizedKeyword);
  });
}

export type QualificationTemplateKindName = { kind: string; name: string };

/**
 * UI はテンプレートの kind をそのまま送る想定。kind / name の正規化一致を優先し、その後にキーワード照合。
 */
export function resolveQualificationTemplateForKindInput<T extends QualificationTemplateKindName>(
  templates: T[],
  input: string
): T | null {
  const n = normalizeQualificationKind(input);
  if (!n) return null;

  const exactKind = templates.find((t) => normalizeQualificationKind(t.kind) === n);
  if (exactKind) return exactKind;

  const exactName = templates.find((t) => normalizeQualificationKind(t.name) === n);
  if (exactName) return exactName;

  return (
    templates.find(
      (template) =>
        matchesQualificationKeywords(input, [template.kind]) ||
        matchesQualificationKeywords(input, [template.name])
    ) ?? null
  );
}

/** 固定別名リストからテンプレート kind を解決（例: BLS・WS → DB の kind） */
export function findTemplateKindByKeywords(
  templates: QualificationTemplateKindName[],
  keywords: string[]
): string | null {
  const hit = templates.find(
    (t) =>
      matchesQualificationKeywords(t.kind, keywords) ||
      matchesQualificationKeywords(t.name, keywords)
  );
  return hit?.kind ?? null;
}
