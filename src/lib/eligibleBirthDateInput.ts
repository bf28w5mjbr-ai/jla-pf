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
