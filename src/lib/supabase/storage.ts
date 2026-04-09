import { createAdminClient } from "@/lib/supabase/admin";

function getStorageBucket(): string | null {
  return process.env.SUPABASE_STORAGE_BUCKET ?? null;
}

export function canUseSupabaseStorage(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && getStorageBucket());
}

export async function uploadPublicAsset(params: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const bucket = getStorageBucket();
  if (!bucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is not configured");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(params.objectKey, params.body, {
    contentType: params.contentType,
    cacheControl: "3600",
    upsert: true,
  });
  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(params.objectKey);
  if (!data.publicUrl) {
    throw new Error("Supabase storage public URL の取得に失敗しました");
  }
  return data.publicUrl;
}

export async function deletePublicAssetByUrl(fileUrl: string): Promise<void> {
  const bucket = getStorageBucket();
  if (!bucket) return;

  let objectKey = "";
  try {
    const parsed = new URL(fileUrl);
    const marker = `/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return;
    objectKey = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return;
  }

  if (!objectKey) return;
  const supabase = createAdminClient();
  await supabase.storage.from(bucket).remove([objectKey]);
}

