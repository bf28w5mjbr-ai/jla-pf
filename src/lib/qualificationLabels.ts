const qualificationLabelMap: Record<string, string> = {
  BLS: "BLS",
  WaterSafety: "ウォーターセーフティ",
  BasicSurfLifesaver: "ベーシックサーフライフセーバー",
  AdvancedSurfLifesaver: "アドバンスドサーフライフセーバー",
  PoolLifeguard: "プールライフガード",
  AdvancedPoolLifeguard: "アドバンスドプールライフガード",
  IRBCrew: "IRBクルー",
  IRBDriver: "IRBドライバー",
  Leader: "リーダー",
  Instructor: "インストラクター",
  PWRCCrew: "PWRCクルー",
  PWRCOperator: "PWRCオペレーター",
  PWRCAssistantInstructor: "PWRCアシスタントインストラクター",
  PWRCInstructor: "PWRCインストラクター",
  RefereeC: "審判C",
  RefereeB: "審判B",
  RefereeA: "審判A",
  RefereeS: "審判S",
  BLSAssistantInstructor: "BLSアシスタントインストラクター",
  BLSInstructor: "BLSインストラクター",
  WaterSafetyAssistantInstructor: "ウォーターセーフティアシスタントインストラクター",
  WaterSafetyInstructor: "ウォーターセーフティインストラクター",
  SurfAssistantInstructor: "サーフアシスタントインストラクター",
  SurfInstructor: "サーフインストラクター",
  PoolAssistantInstructor: "プールアシスタントインストラクター",
  PoolInstructor: "プールインストラクター",
  IRBAssistantInstructor: "IRBアシスタントインストラクター",
  IRBInstructor: "IRBインストラクター",
  JuniorAssistantInstructor: "ジュニアアシスタントインストラクター",
  JuniorInstructor: "ジュニアインストラクター",
};

export function qualificationJapaneseLabel(kind: string, fallback?: string | null): string {
  return qualificationLabelMap[kind] ?? fallback?.trim() ?? kind;
}

export function qualificationJapaneseList(kinds: string[]): string[] {
  return kinds.map((kind) => qualificationJapaneseLabel(kind));
}

export function qualificationJapaneseExpression(expression: string): string {
  const keys = Object.keys(qualificationLabelMap).sort((a, b) => b.length - a.length);
  let out = expression;
  for (const key of keys) {
    const pattern = new RegExp(`\\b${key}\\b`, "g");
    out = out.replace(pattern, qualificationLabelMap[key]!);
  }
  return out.replace(/\bAND\b/g, "かつ").replace(/\bOR\b/g, "または");
}

/** カタログ行の期限ラベル。保有レコードの expiryDate や判定ロジックとは独立。 */
export function isUsableQualificationTemplateValidityMonths(
  validityMonths: number | null | undefined
): validityMonths is number {
  return typeof validityMonths === "number" && Number.isInteger(validityMonths) && validityMonths > 0;
}

export function qualificationTemplateValidityLabel(input: {
  requiresExpiry: boolean;
  validityMonths: number | null | undefined;
}): string {
  if (!input.requiresExpiry) return "有効期限なし";
  if (isUsableQualificationTemplateValidityMonths(input.validityMonths)) {
    return `有効期間: ${input.validityMonths}か月`;
  }
  return "有効期限あり（期間未設定）";
}
