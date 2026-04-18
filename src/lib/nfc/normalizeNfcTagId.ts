/**
 * NFC タグ ID の正規化（サーバ API・DB と同一の規約）。
 * Web NFC の serialNumber（コロン区切り hex）・ネイティブのバイト列 hex・手入力を揃える。
 */
export function normalizeNfcTagId(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s\-:]/g, "");
}
