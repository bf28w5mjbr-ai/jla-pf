export type RelationLogo = { name: string; logoUrl: string };

function pickTrimmedString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return null;
}

/**
 * Competition.cooperatorsLogos / grantsLogos（JSON）を表示用に正規化する。
 * キー揺れ（logo_url 等）や前後空白を吸収する。
 */
export function normalizeRelationLogos(value: unknown): RelationLogo[] {
  if (!Array.isArray(value)) return [];
  const out: RelationLogo[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const rawUrl =
      pickTrimmedString(o, ["logoUrl", "logo_url", "url", "src", "href"]) ?? "";
    if (!rawUrl) continue;
    const logoUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const name = pickTrimmedString(o, ["name", "title", "label"]) ?? "";
    out.push({ name: name || "ロゴ", logoUrl });
  }
  return out;
}
