import { createClient } from "@supabase/supabase-js";
import { fetchWithConnectionRetry } from "@/lib/browserUploadHelpers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export type DirectOrganizationLogoUploadResult =
  | { kind: "success"; logoUrl: string }
  | { kind: "reject"; message: string }
  | { kind: "multipart" };

const SESSION_FETCH_ATTEMPTS = 4;
const SESSION_FETCH_BASE_MS = 500;

/** {@link tryJsonBase64OrganizationLogoUpload} と API の `MAX_JSON_BODY_DECODED_BYTES` に合わせる */
export const ORGANIZATION_LOGO_JSON_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

const resilientFetch: typeof fetch = (input, init) =>
  fetchWithConnectionRetry(input, init, {
    attempts: SESSION_FETCH_ATTEMPTS,
    baseDelayMs: SESSION_FETCH_BASE_MS,
  });

/**
 * 画像バイナリを自サイト API に載せず Supabase Storage へ直送し、確定は小さな JSON のみ自サイトに返す。
 * 失敗時は従来の multipart アップロードへフォールバックできるよう {@link kind} `"multipart"` を返す。
 */
export async function tryDirectOrganizationLogoUpload(
  organizationId: string,
  file: File,
): Promise<DirectOrganizationLogoUploadResult> {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    return { kind: "multipart" };
  }

  let sessionRes: Response;
  try {
    sessionRes = await fetchWithConnectionRetry(
      `/api/organizations/${organizationId}/logo/upload-session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name }),
      },
      { attempts: SESSION_FETCH_ATTEMPTS, baseDelayMs: SESSION_FETCH_BASE_MS },
    );
  } catch {
    return { kind: "multipart" };
  }

  if (sessionRes.status === 503) {
    const j = (await sessionRes.json().catch(() => null)) as { directUpload?: boolean } | null;
    if (j?.directUpload === false) {
      return { kind: "multipart" };
    }
  }

  if (!sessionRes.ok) {
    if (sessionRes.status === 401 || sessionRes.status === 403) {
      const data = (await sessionRes.json().catch(() => ({}))) as { error?: unknown };
      return {
        kind: "reject",
        message: typeof data.error === "string" ? data.error : "アップロードできませんでした",
      };
    }
    return { kind: "multipart" };
  }

  const session = (await sessionRes.json().catch(() => null)) as {
    path?: string;
    token?: string;
    bucket?: string;
    signedUrl?: string;
  } | null;
  if (!session?.path || !session.token || !session.bucket) {
    return { kind: "multipart" };
  }

  const supabase = createClient(url, key, { global: { fetch: resilientFetch } });
  const contentType =
    file.type && file.type !== "application/octet-stream"
      ? file.type
      : "application/octet-stream";

  const { error: upErr } = await supabase.storage
    .from(session.bucket)
    .uploadToSignedUrl(session.path, session.token, file, {
      contentType,
      cacheControl: "3600",
    });

  if (upErr) {
    console.error("uploadToSignedUrl:", upErr, session.signedUrl ? "(signedUrl あり)" : "");
    return { kind: "multipart" };
  }

  let completeRes: Response;
  try {
    completeRes = await fetchWithConnectionRetry(
      `/api/organizations/${organizationId}/logo/upload-complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: session.path }),
      },
      { attempts: SESSION_FETCH_ATTEMPTS, baseDelayMs: SESSION_FETCH_BASE_MS },
    );
  } catch {
    return { kind: "multipart" };
  }

  if (completeRes.status === 400) {
    const data = (await completeRes.json().catch(() => ({}))) as { error?: unknown };
    return {
      kind: "reject",
      message: typeof data.error === "string" ? data.error : "画像を確認できませんでした",
    };
  }

  if (!completeRes.ok) {
    const data = (await completeRes.json().catch(() => ({}))) as { error?: unknown };
    if (completeRes.status === 401 || completeRes.status === 403) {
      return {
        kind: "reject",
        message: typeof data.error === "string" ? data.error : "アップロードできませんでした",
      };
    }
    return { kind: "multipart" };
  }

  const done = (await completeRes.json().catch(() => null)) as { logoUrl?: string } | null;
  if (!done?.logoUrl) {
    return { kind: "multipart" };
  }

  return { kind: "success", logoUrl: done.logoUrl };
}

export type JsonBase64LogoUploadResult =
  | { kind: "success"; logoUrl: string }
  | { kind: "skip" }
  | { kind: "reject"; message: string };

/**
 * multipart が通らない回線向け。application/json の単一フィールドで送る（3MB 以下のみ）。
 */
export async function tryJsonBase64OrganizationLogoUpload(
  organizationId: string,
  file: File,
): Promise<JsonBase64LogoUploadResult> {
  if (file.size > ORGANIZATION_LOGO_JSON_UPLOAD_MAX_BYTES) {
    return { kind: "skip" };
  }

  const fileBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      if (s.startsWith("data:")) {
        const i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      } else {
        resolve(s);
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });

  let res: Response;
  try {
    res = await fetchWithConnectionRetry(
      `/api/organizations/${organizationId}/logo/upload-json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64 }),
      },
      { attempts: SESSION_FETCH_ATTEMPTS, baseDelayMs: SESSION_FETCH_BASE_MS },
    );
  } catch {
    return { kind: "skip" };
  }

  if (res.status === 400 || res.status === 413) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    return {
      kind: "reject",
      message: typeof data.error === "string" ? data.error : "画像をアップロードできませんでした",
    };
  }

  if (!res.ok) {
    return { kind: "skip" };
  }

  const data = (await res.json().catch(() => null)) as { logoUrl?: string } | null;
  if (!data?.logoUrl) {
    return { kind: "skip" };
  }

  return { kind: "success", logoUrl: data.logoUrl };
}
