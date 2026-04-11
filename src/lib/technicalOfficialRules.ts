import type { QualificationStatus } from "@prisma/client";
import {
  isQualificationExpired,
  normalizeQualificationKind,
} from "@/lib/qualificationTemplateRules";

/** オフィシャル応募フィルタで「ライフセービング系」として必須とする資格種別（審判資格とは別） */
export const OFFICIAL_RECRUITMENT_REQUIRED_LIFESAVING_KINDS = ["BLS"] as const;

export type TechnicalOfficialTier = { minEntries: number; requiredCount: number };

export function parseTechnicalOfficialTiers(raw: unknown): TechnicalOfficialTier[] {
  if (!Array.isArray(raw)) return [];
  const out: TechnicalOfficialTier[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as { minEntries?: unknown; requiredCount?: unknown };
    if (typeof r.minEntries !== "number" || typeof r.requiredCount !== "number") continue;
    if (!Number.isFinite(r.minEntries) || !Number.isFinite(r.requiredCount)) continue;
    if (r.minEntries < 0 || r.requiredCount < 0) continue;
    out.push({ minEntries: r.minEntries, requiredCount: r.requiredCount });
  }
  return out.sort((a, b) => a.minEntries - b.minEntries);
}

/** クラブの個人エントリー件数に対し、最も高い閾値行のみ適用（仕様 A） */
export function requiredTechnicalOfficialCount(
  entryCount: number,
  tiers: TechnicalOfficialTier[]
): number {
  const sorted = [...tiers].sort((a, b) => b.minEntries - a.minEntries);
  for (const t of sorted) {
    if (entryCount >= t.minEntries) return t.requiredCount;
  }
  return 0;
}

export function isQualificationValidForTechnicalOfficial(params: {
  kind: string;
  status: QualificationStatus;
  expiryDate: Date | null;
  templateKind: string;
  asOf?: Date;
}): boolean {
  const { kind, status, expiryDate, templateKind } = params;
  const asOf = params.asOf ?? new Date();
  if (status !== "APPROVED") return false;
  if (kind !== templateKind) return false;
  if (expiryDate) {
    const end = new Date(expiryDate);
    end.setHours(23, 59, 59, 999);
    if (end < asOf) return false;
  }
  return true;
}

export function hasRequiredOfficialQualifications(
  qualifications: Array<{
    kind: string;
    status: QualificationStatus;
    expiryDate: Date | null;
  }>
): boolean {
  const requiredKinds = [...OFFICIAL_RECRUITMENT_REQUIRED_LIFESAVING_KINDS];
  const refereeKinds = ["RefereeC", "RefereeB", "RefereeA", "RefereeS"];

  const approvedValidKindSet = new Set(
    qualifications
      .filter((q) => q.status === "APPROVED")
      .filter((q) => !isQualificationExpired(q.expiryDate))
      .map((q) => normalizeQualificationKind(q.kind))
  );

  const hasRequired = requiredKinds.every((kind) =>
    approvedValidKindSet.has(normalizeQualificationKind(kind))
  );
  const hasAnyReferee = refereeKinds.some((kind) =>
    approvedValidKindSet.has(normalizeQualificationKind(kind))
  );
  return hasRequired && hasAnyReferee;
}
