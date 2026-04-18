import { normalizeNfcTagId } from "@/lib/nfc/normalizeNfcTagId";

/** Capgo プラグイン等の `id` バイト列を正規化済みタグ ID に変換 */
export function nfcTagIdFromByteArray(bytes: number[]): string {
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return normalizeNfcTagId(hex);
}
