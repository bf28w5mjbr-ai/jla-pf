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

function pickLogoUrl(record: Record<string, unknown>): string {
  const keys = ["logoUrl", "logo_url", "logoURL", "LogoUrl", "url", "src", "href"];
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t.startsWith("//") ? `https:${t}` : t;
    }
  }
  return "";
}

function tryParseJsonArray(value: unknown): unknown[] | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t[0] !== "[") return null;
  try {
    const p = JSON.parse(t) as unknown;
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Competition.cooperatorsLogos / grantsLogos（JSON）を表示用に正規化する。
 * キー揺れ（logo_url 等）、JSON 文字列、前後空白を吸収する。
 */
export function normalizeRelationLogos(value: unknown): RelationLogo[] {
  if (value == null) return [];

  let rows: unknown[];
  if (Array.isArray(value)) {
    rows = value;
  } else {
    const parsed = tryParseJsonArray(value);
    if (!parsed) return [];
    rows = parsed;
  }

  const out: RelationLogo[] = [];
  for (const item of rows) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const logoUrl = pickLogoUrl(o);
    if (!logoUrl) continue;
    const name = pickTrimmedString(o, ["name", "title", "label"]) ?? "";
    out.push({ name: name || "ロゴ", logoUrl });
  }
  return out;
}
