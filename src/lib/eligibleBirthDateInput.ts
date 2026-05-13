/** DB の日付を date 入力用 YYYY-MM-DD に（@db.Date は UTC 暦日として解釈） */
export function toEligibleBirthDateInput(d: Date | string | null | undefined): string {
  if (d == null) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "";
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, "0");
  const day = String(x.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** API から受け取る YYYY-MM-DD を @db.Date 用 UTC 暦日に */
export function parseEligibleBirthDateInput(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("invalid");
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new Error("invalid");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    throw new Error("invalid");
  }
  return new Date(Date.UTC(y, mo - 1, d));
}
