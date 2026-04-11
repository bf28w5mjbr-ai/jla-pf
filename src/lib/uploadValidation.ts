import { fileTypeFromBuffer } from "file-type";

/** 画像（ラスタ）: マジックバイトで検証。クライアントの Content-Type は信用しない。 */
const RASTER_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

/**
 * 大会添付など「文書＋画像」: PDF / Office Open XML / 上記ラスタのみ。
 * 実行可能形式や汎用ZIPなどは拒否する。
 */
const COMPETITION_ATTACHMENT_MIMES = new Set([
  ...RASTER_IMAGE_MIMES,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const MIN_BYTES_FOR_DETECTION = 16;

export type ValidatedUpload = {
  mime: string;
  /** 保存ファイル名用（拡張子、ドットなし） */
  ext: string;
};

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/**
 * アップロード元ファイル名から安全なベース名（拡張子除く）を得る。
 * Supabase Storage 等のオブジェクトキーは非 ASCII を拒否することがあるため、
 * 英数字と `._-` のみ残す（画面上の表示名は別途 `File.name` 等を使う）。
 */
export function sanitizeUploadBasename(originalName: string, maxLen = 100): string {
  const withoutExt = originalName.replace(/\.[^./\\]+$/i, "");
  const cleaned = withoutExt.replace(/[^a-zA-Z0-9._-]/g, "_");
  const trimmed = cleaned
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/^\.+|\.+$/g, "");
  return (trimmed || "file").slice(0, maxLen);
}

/**
 * ラスタ画像のみ（プロフィール・クラブロゴ・大会関連ロゴ等）。
 */
export async function validateRasterImageBuffer(
  buffer: Buffer
): Promise<{ ok: true; value: ValidatedUpload } | { ok: false; message: string }> {
  if (!buffer?.length) {
    return invalid("ファイルが空です");
  }
  if (buffer.length < MIN_BYTES_FOR_DETECTION) {
    return invalid("画像データが短すぎます");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected?.mime || !RASTER_IMAGE_MIMES.has(detected.mime)) {
    return invalid(
      "画像の内容を確認できません。JPEG・PNG・GIF・WebP・AVIF のいずれかをアップロードしてください"
    );
  }

  return {
    ok: true,
    value: { mime: detected.mime, ext: detected.ext },
  };
}

/**
 * 団体ロゴ: ラスタまたは制限付き SVG（スクリプト・XXE っぽい宣言を拒否）。
 */
export async function validateOrganizationLogoBuffer(
  buffer: Buffer
): Promise<{ ok: true; value: ValidatedUpload } | { ok: false; message: string }> {
  if (!buffer?.length) {
    return invalid("ファイルが空です");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime && RASTER_IMAGE_MIMES.has(detected.mime)) {
    return {
      ok: true,
      value: { mime: detected.mime, ext: detected.ext },
    };
  }

  const svg = validateSvgSecurityBuffer(buffer);
  if (!svg.ok) {
    return invalid(svg.message);
  }

  return { ok: true, value: { mime: "image/svg+xml", ext: "svg" } };
}

/**
 * 大会資料添付。
 */
export async function validateCompetitionAttachmentBuffer(
  buffer: Buffer
): Promise<{ ok: true; value: ValidatedUpload } | { ok: false; message: string }> {
  if (!buffer?.length) {
    return invalid("ファイルが空です");
  }
  if (buffer.length < MIN_BYTES_FOR_DETECTION) {
    return invalid("ファイルが小さすぎます");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected?.mime || !COMPETITION_ATTACHMENT_MIMES.has(detected.mime)) {
    return invalid(
      "許可されていないファイル形式です。PDF、画像（JPEG/PNG/GIF/WebP/AVIF）、Word/Excel/PowerPoint（.docx/.xlsx/.pptx）のみアップロードできます"
    );
  }

  return {
    ok: true,
    value: { mime: detected.mime, ext: detected.ext },
  };
}

/**
 * SVG の最低限のサニティ（完全なサニタイズではないが、明らかな XSS/XXE 経路を拒否）。
 */
export function validateSvgSecurityBuffer(buffer: Buffer): { ok: true } | { ok: false; message: string } {
  if (buffer.length > 8 * 1024 * 1024) {
    return invalid("SVG は 8MB 以下にしてください");
  }

  let text: string;
  try {
    text = buffer.toString("utf8");
  } catch {
    return invalid("SVG を解釈できません");
  }

  const head = text.trimStart().slice(0, 256);
  if (!/^<\?xml/i.test(head) && !/^<svg\b/i.test(head)) {
    return invalid("SVG 形式ではありません");
  }

  if (/<!ENTITY/i.test(text)) {
    return invalid("SVG に ENTITY 宣言を含められません");
  }
  if (/<!DOCTYPE/i.test(text) && /SYSTEM/i.test(text)) {
    return invalid("SVG に外部 SYSTEM を含む DOCTYPE を含められません");
  }
  if (/<script[\s>/]/i.test(text)) {
    return invalid("SVG に script を含められません");
  }
  if (/\bon[a-z]+\s*=/i.test(text)) {
    return invalid("SVG にインラインイベント属性を含められません");
  }

  return { ok: true };
}
