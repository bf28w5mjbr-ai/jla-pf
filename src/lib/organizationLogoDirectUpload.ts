import { createClient } from "@supabase/supabase-js";
import { fetchWithConnectionRetry } from "@/lib/browserUploadHelpers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export type DirectOrganizationLogoUploadResult =
  | { kind: "success"; logoUrl: string }
  | { kind: "reject"; message: string }
  | { kind: "multipart" };

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
      { attempts: 2, baseDelayMs: 400 },
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
  } | null;
  if (!session?.path || !session.token || !session.bucket) {
    return { kind: "multipart" };
  }

  const supabase = createClient(url, key);
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
    console.error("uploadToSignedUrl:", upErr);
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
      { attempts: 2, baseDelayMs: 400 },
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
