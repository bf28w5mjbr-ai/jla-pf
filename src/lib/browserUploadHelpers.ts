/**
 * ブラウザからのアップロード用。通信の一時失敗に対する fetch の再試行。
 * （1回目がサーバーに届いているのに応答だけ落ちるケースでは二重投稿の可能性があるが、
 * ロゴ上書き用途では許容し、接続系エラーのみ再試行する）
 */
import { PROFILE_PHOTO_MAX_EDGE_PX } from "@/lib/profilePhotoUpload";

export async function fetchWithConnectionRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<Response> {
  const maxAttempts = Math.max(1, options?.attempts ?? 3);
  const baseDelayMs = options?.baseDelayMs ?? 700;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastError = e;
      if (attempt === maxAttempts - 1) break;
      const delay = baseDelayMs * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function isLikelyRasterImage(file: File): boolean {
  if (file.type === "image/svg+xml") return false;
  if (file.name.toLowerCase().endsWith(".svg")) return false;
  return file.type.startsWith("image/");
}

export async function downscaleProfilePhotoFileIfLarge(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return downscaleRasterImageFileIfLarge(file, PROFILE_PHOTO_MAX_EDGE_PX);
}

/**
 * 大きなラスタ画像をアップロード前に縮小し、転送量とサーバー負荷を下げる。
 * SVG はそのまま返す。
 */
export async function downscaleRasterLogoFileIfLarge(
  file: File,
  maxEdge = 1920,
): Promise<File> {
  return downscaleRasterImageFileIfLarge(file, maxEdge, { minBytesToAttempt: 900_000 });
}

async function downscaleRasterImageFileIfLarge(
  file: File,
  maxEdge: number,
  options?: { minBytesToAttempt?: number },
): Promise<File> {
  if (!isLikelyRasterImage(file)) return file;
  const minBytes = options?.minBytesToAttempt ?? 0;
  if (file.size < minBytes) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    if (width <= maxEdge && height <= maxEdge) return file;

    const scale = maxEdge / Math.max(width, height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.88),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^./\\]+$/i, "") || "upload";
    return new File([blob], `${base}-upload.webp`, { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}
