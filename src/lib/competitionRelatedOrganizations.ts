import { nanoid } from "nanoid";
import {
  inferSupabasePublicUrlFromRelativePublicUploadPath,
} from "./publicUploadSupabaseInfer";
import {
  normalizeRelationLogos,
  normalizeStoredRelationLogoUrl,
  type RelationLogoView,
} from "./relationLogos";

export type CompetitionRelationRole = "sponsor" | "cooperator" | "supporter" | "grant";

export type CompetitionRelatedOrganization = {
  id: string;
  name: string;
  role: CompetitionRelationRole;
  logoUrl?: string | null;
  sortOrder: number;
};

export type CompetitionRelatedOrganizationView = CompetitionRelatedOrganization & {
  displaySrc?: string | null;
};

export const COMPETITION_RELATION_ROLES: readonly CompetitionRelationRole[] = [
  "sponsor",
  "cooperator",
  "supporter",
  "grant",
] as const;

export const ROLE_LABELS: Record<CompetitionRelationRole, string> = {
  sponsor: "後援",
  cooperator: "協賛",
  supporter: "協力",
  grant: "助成",
};

export function parseCompetitionRelationRole(value: unknown): CompetitionRelationRole | null {
  if (
    value === "sponsor" ||
    value === "cooperator" ||
    value === "supporter" ||
    value === "grant"
  ) {
    return value;
  }
  return null;
}

export function createRelatedOrganizationId(): string {
  return nanoid();
}

function tryParseJsonArray(value: unknown): unknown[] | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t[0] !== "[") return null;
  try {
    const p = JSON.parse(t) as unknown;
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

function pickTrimmedString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return null;
}

function pickLogoUrl(record: Record<string, unknown>): string | null {
  const keys = ["logoUrl", "logo_url", "logoURL", "LogoUrl", "url", "src", "href"];
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t.startsWith("//") ? `https:${t}` : t;
    }
  }
  return null;
}

function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return normalizeStoredRelationLogoUrl(t);
}

function isPrehydratedRelatedOrganizationViews(
  value: unknown,
): value is CompetitionRelatedOrganizationView[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const item of value) {
    if (typeof item !== "object" || item === null) return false;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string" || typeof o.role !== "string") {
      return false;
    }
    if (!("displaySrc" in o)) return false;
  }
  return true;
}

export function normalizeRelatedOrganizations(value: unknown): CompetitionRelatedOrganization[] {
  if (value == null) return [];

  let rows: unknown[];
  if (Array.isArray(value)) {
    rows = value;
  } else {
    const parsed = tryParseJsonArray(value);
    if (!parsed) return [];
    rows = parsed;
  }

  const out: CompetitionRelatedOrganization[] = [];
  for (const item of rows) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const id = pickTrimmedString(o, ["id"]);
    const name = pickTrimmedString(o, ["name", "title", "label"]);
    const role = parseCompetitionRelationRole(o.role ?? o.type);
    if (!id || !name || !role) continue;

    const sortOrderRaw = o.sortOrder ?? o.sort_order ?? o.displayOrder ?? o.display_order;
    const sortOrder =
      typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw)
        ? sortOrderRaw
        : out.length;

    const logoUrl = normalizeLogoUrl(o.logoUrl ?? o.logo_url);

    out.push({
      id,
      name,
      role,
      logoUrl,
      sortOrder,
    });
  }

  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja"));
}

export function relatedOrganizationsWithDisplaySrc(
  value: unknown,
): CompetitionRelatedOrganizationView[] {
  if (isPrehydratedRelatedOrganizationViews(value)) {
    return value;
  }

  return normalizeRelatedOrganizations(value).map((row) => {
    const logoUrl = row.logoUrl ? normalizeStoredRelationLogoUrl(row.logoUrl) : null;
    const inferred =
      logoUrl != null
        ? inferSupabasePublicUrlFromRelativePublicUploadPath(logoUrl)
        : null;
    return {
      ...row,
      logoUrl,
      displaySrc: logoUrl != null ? (inferred ?? logoUrl) : null,
    };
  });
}

export type GroupedRelatedOrganizations = Record<
  CompetitionRelationRole,
  CompetitionRelatedOrganizationView[]
>;

export function groupRelatedOrganizationsByRole(
  orgs: CompetitionRelatedOrganizationView[],
): GroupedRelatedOrganizations {
  const grouped: GroupedRelatedOrganizations = {
    sponsor: [],
    cooperator: [],
    supporter: [],
    grant: [],
  };
  for (const org of orgs) {
    grouped[org.role].push(org);
  }
  return grouped;
}

export function createEmptyRelatedOrganization(
  role: CompetitionRelationRole = "sponsor",
  sortOrder = 0,
): CompetitionRelatedOrganization {
  return {
    id: createRelatedOrganizationId(),
    name: "",
    role,
    logoUrl: null,
    sortOrder,
  };
}

export type LegacyRelationFields = {
  sponsors?: string | null;
  cooperators?: string | null;
  cooperatorsLogos?: unknown;
  supporters?: string | null;
  grants?: string | null;
  grantsLogos?: unknown;
  relatedOrganizations?: unknown;
};

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function migrateLegacyRelatedOrganizations(
  fields: LegacyRelationFields,
): CompetitionRelatedOrganization[] {
  const existing = normalizeRelatedOrganizations(fields.relatedOrganizations);
  if (existing.length > 0) return existing;

  const orgs: CompetitionRelatedOrganization[] = [];
  let sortOrder = 0;

  const textRoles: [CompetitionRelationRole, string | null | undefined][] = [
    ["sponsor", fields.sponsors],
    ["cooperator", fields.cooperators],
    ["supporter", fields.supporters],
    ["grant", fields.grants],
  ];

  for (const [role, text] of textRoles) {
    if (!text?.trim()) continue;
    for (const line of text.split(/\r?\n/u)) {
      const name = line.trim();
      if (!name) continue;
      orgs.push({
        id: createRelatedOrganizationId(),
        name,
        role,
        logoUrl: null,
        sortOrder: sortOrder++,
      });
    }
  }

  const logoRoles: [CompetitionRelationRole, unknown][] = [
    ["cooperator", fields.cooperatorsLogos],
    ["grant", fields.grantsLogos],
  ];

  for (const [role, logosRaw] of logoRoles) {
    const logos = normalizeRelationLogos(logosRaw);
    for (const logo of logos) {
      const logoUrl = normalizeStoredRelationLogoUrl(logo.logoUrl);
      const logoName = logo.name.trim() || "ロゴ";
      const matchIdx = orgs.findIndex(
        (o) => o.role === role && namesMatch(o.name, logoName) && !o.logoUrl,
      );
      if (matchIdx >= 0) {
        orgs[matchIdx] = { ...orgs[matchIdx], logoUrl };
      } else {
        orgs.push({
          id: createRelatedOrganizationId(),
          name: logoName,
          role,
          logoUrl,
          sortOrder: sortOrder++,
        });
      }
    }
  }

  return orgs;
}

export type ValidateRelatedOrganizationsResult =
  | { ok: true; organizations: CompetitionRelatedOrganization[] }
  | { ok: false; error: string };

export function validateRelatedOrganizationsPayload(
  value: unknown,
): ValidateRelatedOrganizationsResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "relatedOrganizations は配列である必要があります" };
  }

  const organizations: CompetitionRelatedOrganization[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: `行 ${i + 1}: 無効なデータです` };
    }
    const o = raw as Record<string, unknown>;
    const id = pickTrimmedString(o, ["id"]);
    const name = pickTrimmedString(o, ["name"]);
    const role = parseCompetitionRelationRole(o.role ?? o.type);

    if (!id) return { ok: false, error: `行 ${i + 1}: id が必要です` };
    if (seenIds.has(id)) return { ok: false, error: `行 ${i + 1}: id が重複しています` };
    seenIds.add(id);

    if (!name) return { ok: false, error: `行 ${i + 1}: 名前が必要です` };
    if (!role) return { ok: false, error: `行 ${i + 1}: 無効な属性です` };

    const sortOrderRaw = o.sortOrder ?? o.sort_order;
    const sortOrder =
      typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw) ? sortOrderRaw : i;

    organizations.push({
      id,
      name,
      role,
      logoUrl: normalizeLogoUrl(o.logoUrl ?? o.logo_url),
      sortOrder,
    });
  }

  return { ok: true, organizations };
}

/** ロゴ表示用: logoUrl がある行のみ RelationLogoView 形式に変換 */
export function relatedOrganizationToLogoView(
  org: CompetitionRelatedOrganizationView,
): RelationLogoView | null {
  if (!org.logoUrl || !org.displaySrc) return null;
  return {
    name: org.name,
    logoUrl: org.logoUrl,
    displaySrc: org.displaySrc,
  };
}

export function collectRemovedLogoUrls(
  previous: CompetitionRelatedOrganization[],
  next: CompetitionRelatedOrganization[],
): string[] {
  const nextUrls = new Set(
    next.map((o) => o.logoUrl).filter((u): u is string => typeof u === "string" && u.length > 0),
  );
  const removed: string[] = [];
  for (const org of previous) {
    if (org.logoUrl && !nextUrls.has(org.logoUrl)) {
      removed.push(org.logoUrl);
    }
  }
  return removed;
}

/** DB 読み取り: relatedOrganizations が空なら旧6フィールドから合成 */
export function resolveRelatedOrganizationsForDisplay(
  fields: LegacyRelationFields,
): CompetitionRelatedOrganizationView[] {
  const direct = relatedOrganizationsWithDisplaySrc(fields.relatedOrganizations);
  if (direct.length > 0) return direct;
  return relatedOrganizationsWithDisplaySrc(migrateLegacyRelatedOrganizations(fields));
}
