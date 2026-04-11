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
