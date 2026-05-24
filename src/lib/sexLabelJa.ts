/** 種目・スタートリスト表示用の性別ラベル（日本語） */
export function sexLabelJa(sex?: string | null): string {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "その他";
}
