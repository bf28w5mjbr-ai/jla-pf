import { createClient } from "@supabase/supabase-js";
import { fetchWithConnectionRetry } from "@/lib/browserUploadHelpers";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export type CompetitionRelationLogoUploadResponse = {
  logos?: unknown;
  logoUrl?: string;
  name?: string;
};

export type DirectCompetitionRelationLogoUploadResult =
  | { kind: "success"; data: CompetitionRelationLogoUploadResponse }
  | { kind: "reject"; message: string }
  | { kind: "multipart" };

export type JsonCompetitionRelationLogoUploadResult =
  | { kind: "success"; data: CompetitionRelationLogoUploadResponse }
  | { kind: "reject"; message: string }
  | { kind: "skip" };

const SESSION_FETCH_ATTEMPTS = 4;
const SESSION_FETCH_BASE_MS = 500;
export const COMPETITION_RELATION_LOGO_JSON_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

const resilientFetch: typeof fetch = (input, init) =>
  fetchWithConnectionRetry(input, init, {
    attempts: SESSION_FETCH_ATTEMPTS,
    baseDelayMs: SESSION_FETCH_BASE_MS,
  });

export async function tryDirectCompetitionRelationLogoUpload(
  competitionId: string,
  type: "cooperator" | "grant",
  file: File,
  name: string,
): Promise<DirectCompetitionRelationLogoUploadResult> {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) return { kind: "multipart" };

  let sessionRes: Response;
  try {
    sessionRes = await resilientFetch(`/api/competitions/${competitionId}/relations/logo/upload-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, fileName: file.name }),
    });
  } catch {
    return { kind: "multipart" };
  }

  if (sessionRes.status === 503) {
    const j = (await sessionRes.json().catch(() => null)) as { directUpload?: boolean } | null;
    if (j?.directUpload === false) return { kind: "multipart" };
  }

  if (!sessionRes.ok) {
    if (sessionRes.status === 400 || sessionRes.status === 401 || sessionRes.status === 403) {
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
    console.error("competition uploadToSignedUrl:", upErr);
    return { kind: "multipart" };
  }

  let completeRes: Response;
  try {
    completeRes = await resilientFetch(`/api/competitions/${competitionId}/relations/logo/upload-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, path: session.path }),
    });
  } catch {
    return { kind: "multipart" };
  }

  if (completeRes.status === 400 || completeRes.status === 401 || completeRes.status === 403) {
    const data = (await completeRes.json().catch(() => ({}))) as { error?: unknown };
    return {
      kind: "reject",
      message: typeof data.error === "string" ? data.error : "画像をアップロードできませんでした",
    };
  }
  if (!completeRes.ok) return { kind: "multipart" };

  const data = (await completeRes.json().catch(() => null)) as CompetitionRelationLogoUploadResponse | null;
  if (!data) return { kind: "multipart" };
  return { kind: "success", data };
}

export async function tryJsonCompetitionRelationLogoUpload(
  competitionId: string,
  type: "cooperator" | "grant",
  file: File,
  name: string,
): Promise<JsonCompetitionRelationLogoUploadResult> {
  if (file.size > COMPETITION_RELATION_LOGO_JSON_UPLOAD_MAX_BYTES) {
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
    res = await resilientFetch(`/api/competitions/${competitionId}/relations/logo/upload-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, fileBase64 }),
    });
  } catch {
    return { kind: "skip" };
  }

  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 413) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    return {
      kind: "reject",
      message: typeof data.error === "string" ? data.error : "画像をアップロードできませんでした",
    };
  }
  if (!res.ok) return { kind: "skip" };

  const data = (await res.json().catch(() => null)) as CompetitionRelationLogoUploadResponse | null;
  if (!data) return { kind: "skip" };
  return { kind: "success", data };
}
