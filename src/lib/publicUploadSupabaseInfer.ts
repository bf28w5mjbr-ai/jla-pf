/**
 * DB に残る `/uploads/...` 相対パスを、実体が Supabase Storage にある本番向けに公開 URL へ推定する。
 * `relationLogos` と団体ロゴ等で共有する。
 */

function getSupabaseProjectUrlForPublicUploads(): string | null {
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (pub) return pub.replace(/\/$/, "");
  // サーバー専用 env（クライアントバンドルでは未設定）
  if (typeof window === "undefined") {
    const srv = process.env.SUPABASE_URL?.trim();
    if (srv) return srv.replace(/\/$/, "");
  }
  return null;
}

function getStorageBucketForPublicUploads(): string | null {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() ||
    null
  );
}

function shouldInferSupabasePublicUrlForRelativeUploads(): boolean {
  if (process.env.RELATION_LOGOS_INFER_SUPABASE === "0") return false;
  if (process.env.RELATION_LOGOS_INFER_SUPABASE === "1") return true;
  return Boolean(
    getSupabaseProjectUrlForPublicUploads() && getStorageBucketForPublicUploads(),
  );
}

const UPLOAD_PREFIXES = [
  { pathPrefix: "/uploads/competitions/", objectDir: "competitions" },
  { pathPrefix: "/uploads/organizations/", objectDir: "organizations" },
  { pathPrefix: "/uploads/clubs/", objectDir: "clubs" },
] as const;

/**
 * 相対パス `/uploads/{competitions|organizations|clubs}/<file>` を Storage 公開 URL に変換できるときだけ返す。
 */
export function inferSupabasePublicUrlFromRelativePublicUploadPath(logoUrl: string): string | null {
  if (!shouldInferSupabasePublicUrlForRelativeUploads()) return null;
  const base = getSupabaseProjectUrlForPublicUploads();
  const bucket = getStorageBucketForPublicUploads();
  if (!base || !bucket) return null;

  for (const { pathPrefix, objectDir } of UPLOAD_PREFIXES) {
    if (!logoUrl.startsWith(pathPrefix)) continue;
    const fileName = logoUrl.slice(pathPrefix.length);
    if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      return null;
    }
    return `${base}/storage/v1/object/public/${bucket}/${objectDir}/${fileName}`;
  }
  return null;
}

/** 保存値の揺れ（前後空白・二重エンコード・先頭スラ抜け）を吸収 */
export function normalizeStoredPublicUploadUrl(logoUrl: string): string {
  let t = logoUrl.trim();
  if (!t) return t;
  if (t.startsWith("//")) t = `https:${t}`;
  if ((t.startsWith("http%3A") || t.startsWith("https%3A")) && t.includes("%")) {
    try {
      t = decodeURIComponent(t);
    } catch {
      /* keep */
    }
  }
  if (!t.startsWith("/")) {
    for (const { pathPrefix } of UPLOAD_PREFIXES) {
      const bare = pathPrefix.slice(1);
      if (t.startsWith(bare)) {
        t = `/${t}`;
        break;
      }
    }
  }
  return t;
}

/**
 * 画像表示用 URL。相対 `/uploads/...` かつ Supabase 推定が有効なら公開 URL、それ以外は正規化した保存値。
 */
export function publicUploadDisplaySrc(url: string | null | undefined): string {
  const normalized = normalizeStoredPublicUploadUrl(url?.trim() ?? "");
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return inferSupabasePublicUrlFromRelativePublicUploadPath(normalized) ?? normalized;
}
