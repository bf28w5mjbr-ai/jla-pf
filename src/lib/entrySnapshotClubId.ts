/**
 * EntrySnapshot.data（JSON）から当時の所属クラブ ID を取り出す。
 * エントリー POST のスナップショット形状に合わせる（`serializeEntrySnapshotPayload` と整合）。
 */
export function extractClubIdFromEntrySnapshotData(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const raw = o.clubId;
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s.length > 0 ? s : null;
}
