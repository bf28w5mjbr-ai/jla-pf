/**
 * Supabase Storage の object key 検証（isValidKey）と同じ許可集合に揃える。
 * @see https://github.com/supabase/storage/blob/master/src/storage/limits.ts
 */
const DISALLOWED =
  /[^A-Za-z0-9_\/!.*'()&$@=;:+,?\- ]/g;

export function sanitizeSupabaseObjectKey(key: string): string {
  const sanitized = key.replace(DISALLOWED, "_").replace(/_+/g, "_");
  return sanitized.length > 0 ? sanitized : "object";
}
