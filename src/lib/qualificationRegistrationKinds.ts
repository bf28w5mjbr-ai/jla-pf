import { normalizeQualificationKind } from "@/lib/qualificationTemplateRules";

/**
 * マイページで「登録系」テンプレートに分類する種別（選手登録・BLS/WS・認定ライフセーバー系）。
 * `/profile/qualifications` の区分と一致させること。
 */
const playerRegistrationKeywords = ["選手登録", "player registration", "player_registration"];
const blsWsKeywords = [
  "BLS・WS",
  "BLS/WS",
  "BLS WS",
  "blsws",
  "bls ws",
  "ベーシックライフセーバー",
  "basic lifesaver",
];
const lifesaverKeywords = ["認定ライフセーバー", "certified lifesaver", "cls"];

function matchesKeywords(value: string | null | undefined, keywords: string[]): boolean {
  const normalizedValue = normalizeQualificationKind(value);
  if (!normalizedValue) return false;
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeQualificationKind(keyword);
    return keywordMatchesNorm(normalizedValue, normalizedKeyword);
  });
}

/**
 * キーワードが短いときに includes だけだと誤爆する（例: "bls" が BLSInstructor=blsinstructor にマッチ）。
 * 短いトークンは完全一致のみ、長いフレーズは従来どおり部分一致も許可。
 */
function keywordMatchesNorm(normalizedValue: string, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return false;
  if (normalizedValue === normalizedKeyword) return true;
  if (normalizedKeyword.length <= 3) {
    return false;
  }
  return (
    normalizedValue.includes(normalizedKeyword) ||
    normalizedKeyword.includes(normalizedValue)
  );
}

/** テンプレート kind が単体 `BLS` のとき（BLSInstructor 等とは別） */
function isStandaloneBlsKind(normalized: string): boolean {
  return normalized === "bls";
}

/** 選手登録系テンプレートの kind のみ（BLS・ライフセーバー等は含めない） */
export function isPlayerRegistrationQualificationKind(value: string | null | undefined): boolean {
  return matchesKeywords(value, playerRegistrationKeywords);
}

/** プロフィールの紐づけ区分（テンプレート分類）に使う */
export function isRegistrationQualificationKind(value: string | null | undefined): boolean {
  const n = normalizeQualificationKind(value);
  if (isStandaloneBlsKind(n)) {
    return true;
  }
  return (
    matchesKeywords(value, playerRegistrationKeywords) ||
    matchesKeywords(value, blsWsKeywords) ||
    matchesKeywords(value, lifesaverKeywords)
  );
}
