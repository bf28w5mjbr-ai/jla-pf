import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { verifySession } from "@/lib/auth";
import {
  competitionNotFoundStatus,
  OrganizerLifecycleError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import {
  normalizeRelatedOrganizations,
  parseCompetitionRelationRole,
  relatedOrganizationsWithDisplaySrc,
  type CompetitionRelationRole,
} from "@/lib/competitionRelatedOrganizations";
import { prisma } from "@/server/db";

const LOGO_FILENAME_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "svg",
  "heic",
  "heif",
  "tiff",
]);

export function parseRelatedOrganizationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function relationLogoDisplayName(nameRaw: unknown, fileName: string): string {
  const trimmed = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (trimmed) return trimmed;
  return fileName.replace(/\.[^/.]+$/u, "").trim();
}

export function relationLogoExtensionFromFileName(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1] ?? "png";
  if (ext === "jpeg") return "jpg";
  return LOGO_FILENAME_EXT.has(ext) ? ext : "png";
}

export function buildPendingCompetitionRelationLogoPath(
  competitionId: string,
  organizationId: string,
  fileName: string,
): string {
  const stamp = Date.now();
  const nonce = randomBytes(4).toString("hex");
  const ext = relationLogoExtensionFromFileName(fileName);
  const safeOrgId = organizationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `competitions/${competitionId}-relation-${safeOrgId}-${stamp}-${nonce}.${ext}`;
}

export function isPendingCompetitionRelationLogoPath(
  path: string,
  competitionId: string,
  organizationId: string,
): boolean {
  const escapedComp = competitionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const safeOrgId = organizationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  const escapedOrg = safeOrgId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^competitions/${escapedComp}-relation-${escapedOrg}-\\d+-[a-f0-9]{8}\\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|heic|heif|tiff)$`,
  );
  return re.test(path);
}

export async function requireCompetitionLogoAdmin(
  request: NextRequest,
  competitionId: string,
): Promise<
  | {
      ok: true;
      competition: {
        id: string;
        relatedOrganizations: unknown;
      };
    }
  | { ok: false; response: NextResponse }
> {
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session?.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    };
  }

  try {
    await requireHostOrgAdminForCompetition(competitionId, session.userId);
  } catch (e) {
    if (e instanceof OrganizerLifecycleError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: e.message },
          { status: competitionNotFoundStatus(e.code) },
        ),
      };
    }
    throw e;
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      relatedOrganizations: true,
    },
  });

  if (!competition) {
    return {
      ok: false,
      response: NextResponse.json({ error: "大会が見つかりません" }, { status: 404 }),
    };
  }

  return {
    ok: true,
    competition: {
      id: competition.id,
      relatedOrganizations: competition.relatedOrganizations,
    },
  };
}

export async function setRelatedOrganizationLogo(params: {
  competitionId: string;
  organizationId: string;
  logoUrl: string;
  name?: string;
  role?: CompetitionRelationRole;
}): Promise<{
  organizationId: string;
  logoUrl: string;
  name: string;
  relatedOrganizations: ReturnType<typeof relatedOrganizationsWithDisplaySrc>;
}> {
  const competition = await prisma.competition.findUnique({
    where: { id: params.competitionId },
    select: { relatedOrganizations: true },
  });

  if (!competition) {
    throw new Error("大会が見つかりません");
  }

  const current = normalizeRelatedOrganizations(competition.relatedOrganizations);
  const idx = current.findIndex((o) => o.id === params.organizationId);

  let updated;
  if (idx >= 0) {
    updated = current.map((o, i) =>
      i === idx
        ? {
            ...o,
            logoUrl: params.logoUrl,
            name: params.name?.trim() ? params.name.trim() : o.name,
          }
        : o,
    );
  } else {
    const name = params.name?.trim();
    const role = params.role;
    if (!name || !role) {
      throw new Error("組織が見つかりません。先に行を保存してください");
    }
    updated = [
      ...current,
      {
        id: params.organizationId,
        name,
        role,
        logoUrl: params.logoUrl,
        sortOrder: current.length,
      },
    ];
  }

  const savedRow = updated.find((o) => o.id === params.organizationId);
  if (!savedRow) {
    throw new Error("組織の更新に失敗しました");
  }

  await prisma.competition.update({
    where: { id: params.competitionId },
    data: { relatedOrganizations: updated },
  });

  return {
    organizationId: params.organizationId,
    logoUrl: params.logoUrl,
    name: savedRow.name,
    relatedOrganizations: relatedOrganizationsWithDisplaySrc(updated),
  };
}

export async function clearRelatedOrganizationLogo(params: {
  competitionId: string;
  organizationId: string;
}): Promise<{
  relatedOrganizations: ReturnType<typeof relatedOrganizationsWithDisplaySrc>;
  logoUrl: string;
}> {
  const competition = await prisma.competition.findUnique({
    where: { id: params.competitionId },
    select: { relatedOrganizations: true },
  });

  if (!competition) {
    throw new Error("大会が見つかりません");
  }

  const current = normalizeRelatedOrganizations(competition.relatedOrganizations);
  const target = current.find((o) => o.id === params.organizationId);
  if (!target?.logoUrl) {
    throw new Error("ロゴが見つかりません");
  }

  const logoUrl = target.logoUrl;
  const updated = current.map((o) =>
    o.id === params.organizationId ? { ...o, logoUrl: null } : o,
  );

  await prisma.competition.update({
    where: { id: params.competitionId },
    data: { relatedOrganizations: updated },
  });

  return { relatedOrganizations: relatedOrganizationsWithDisplaySrc(updated), logoUrl };
}

export { parseCompetitionRelationRole };
