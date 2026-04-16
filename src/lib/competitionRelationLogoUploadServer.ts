import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { verifySession } from "@/lib/auth";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { prisma } from "@/server/db";
import { normalizeRelationLogos, relationLogosWithDisplaySrc } from "@/lib/relationLogos";

export type CompetitionRelationLogoType = "cooperator" | "grant";

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

export function parseCompetitionRelationLogoType(value: unknown): CompetitionRelationLogoType | null {
  if (value === "cooperator" || value === "grant") return value;
  return null;
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
  type: CompetitionRelationLogoType,
  fileName: string,
): string {
  const stamp = Date.now();
  const nonce = randomBytes(4).toString("hex");
  const ext = relationLogoExtensionFromFileName(fileName);
  return `competitions/${competitionId}-${type}-${stamp}-${nonce}.${ext}`;
}

export function isPendingCompetitionRelationLogoPath(
  path: string,
  competitionId: string,
  type: CompetitionRelationLogoType,
): boolean {
  const escaped = competitionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^competitions/${escaped}-${type}-\\d+-[a-f0-9]{8}\\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|heic|heif|tiff)$`,
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
        cooperatorsLogos: unknown;
        grantsLogos: unknown;
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

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      cooperatorsLogos: true,
      grantsLogos: true,
      organization: {
        select: {
          admins: {
            where: { userId: session.userId },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });

  if (!competition) {
    return {
      ok: false,
      response: NextResponse.json({ error: "大会が見つかりません" }, { status: 404 }),
    };
  }

  if (!hasOrgAdminAccess(competition.organization.admins)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "編集権限がありません" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    competition: {
      id: competition.id,
      cooperatorsLogos: competition.cooperatorsLogos,
      grantsLogos: competition.grantsLogos,
    },
  };
}

export async function appendCompetitionRelationLogo(params: {
  competitionId: string;
  type: CompetitionRelationLogoType;
  displayName: string;
  logoUrl: string;
}): Promise<{ logoUrl: string; name: string; logos: ReturnType<typeof relationLogosWithDisplaySrc> }> {
  const competition = await prisma.competition.findUnique({
    where: { id: params.competitionId },
    select: {
      cooperatorsLogos: true,
      grantsLogos: true,
    },
  });

  if (!competition) {
    throw new Error("大会が見つかりません");
  }

  const field = params.type === "cooperator" ? "cooperatorsLogos" : "grantsLogos";
  const currentLogos = normalizeRelationLogos(
    params.type === "cooperator" ? competition.cooperatorsLogos : competition.grantsLogos,
  );
  const updatedLogos = [...currentLogos, { name: params.displayName, logoUrl: params.logoUrl }];

  await prisma.competition.update({
    where: { id: params.competitionId },
    data: {
      [field]: updatedLogos,
    },
  });

  return {
    logoUrl: params.logoUrl,
    name: params.displayName,
    logos: relationLogosWithDisplaySrc(updatedLogos),
  };
}
