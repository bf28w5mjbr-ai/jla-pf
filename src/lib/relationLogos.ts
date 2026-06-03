import {
  inferSupabasePublicUrlFromRelativePublicUploadPath,
  normalizeStoredPublicUploadUrl,
} from "./publicUploadSupabaseInfer";

export type RelationLogo = { name: string; logoUrl: string };

/** 表示用 src（推定 URL 含む）。削除 API 等は常に `logoUrl`（DB 保存値）を使う */
export type RelationLogoView = RelationLogo & { displaySrc: string };

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
 * Competition 関係組織ロゴ（relatedOrganizations[].logoUrl）を表示用に正規化する。
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

/** 保存値の揺れ（前後空白・二重エンコード・先頭スラ抜け）を吸収（削除キー整合のため一箇所で正規化） */
export function normalizeStoredRelationLogoUrl(logoUrl: string): string {
  return normalizeStoredPublicUploadUrl(logoUrl);
}

function isPrehydratedRelationLogoViews(value: unknown): value is RelationLogoView[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const item of value) {
    if (typeof item !== "object" || item === null) return false;
    const o = item as Record<string, unknown>;
    if (typeof o.logoUrl !== "string" || typeof o.displaySrc !== "string") return false;
  }
  return true;
}

/**
 * 正規化 + 表示用 `displaySrc`（相対アップロードパスを Storage 公開 URL に推定できる場合）。
 * サーバーで一度付与した `displaySrc` 付き配列はそのまま通す（クライアント再計算で相対に戻さない）。
 */
export function relationLogosWithDisplaySrc(value: unknown): RelationLogoView[] {
  if (isPrehydratedRelationLogoViews(value)) {
    return value;
  }
  const rows = normalizeRelationLogos(value);
  return rows.map((row) => {
    const logoUrl = normalizeStoredRelationLogoUrl(row.logoUrl);
    const inferred = inferSupabasePublicUrlFromRelativePublicUploadPath(logoUrl);
    return {
      name: row.name,
      logoUrl,
      displaySrc: inferred ?? logoUrl,
    };
  });
}
