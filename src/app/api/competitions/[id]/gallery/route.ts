import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import {
  hostOrgAdminGateJsonError,
  requireHostOrgAdminForCompetition,
} from "@/lib/organizerAccess";
import { canUseSupabaseStorage, uploadPublicAsset } from "@/lib/supabase/storage";
import { validateRasterImageBuffer } from "@/lib/uploadValidation";

const MAX_GALLERY_PHOTOS = 60;
const MAX_BYTES = 8 * 1024 * 1024;

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await requireHostOrgAdminForCompetition(id, session.userId);
    } catch (e) {
      const gated = hostOrgAdminGateJsonError(e);
      if (gated) {
        return NextResponse.json({ error: gated.error }, { status: gated.status });
      }
      throw e;
    }

    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        _count: { select: { galleryPhotos: true } },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    if (competition._count.galleryPhotos >= MAX_GALLERY_PHOTOS) {
      return NextResponse.json(
        { error: `写真は最大${MAX_GALLERY_PHOTOS}枚までです` },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "ファイルサイズは8MB以下にしてください" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateRasterImageBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "competitions");
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const ext = validated.value.ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const fileName = `${id}-gallery-${timestamp}-${randomUUID()}.${ext}`;
    const filePath = path.join(uploadDir, fileName);
    let imageUrl = `/uploads/competitions/${fileName}`;
    if (canUseSupabaseStorage()) {
      imageUrl = await uploadPublicAsset({
        objectKey: `competitions/${fileName}`,
        body: buffer,
        contentType: validated.value.mime,
      });
    } else {
      await writeFile(filePath, buffer);
    }

    const photo = await prisma.competitionGalleryPhoto.create({
      data: {
        competitionId: id,
        imageUrl,
        fileName: file.name,
      },
    });

    return NextResponse.json(photo);
  } catch (error) {
    return jsonInternalError500("POST api/competitions/[id]/gallery/route.ts", error);
  }
}
