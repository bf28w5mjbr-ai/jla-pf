import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unlink } from "fs/promises";
import path from "path";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { deletePublicAssetByUrl } from "@/lib/supabase/storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { photoId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const photo = await prisma.competitionGalleryPhoto.findUnique({
      where: { id: photoId },
      include: {
        competition: {
          include: {
            organization: {
              include: {
                admins: {
                  where: { userId: session.userId },
                },
              },
            },
          },
        },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (!hasOrgAdminAccess(photo.competition.organization.admins)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      if (photo.imageUrl.startsWith("http")) {
        await deletePublicAssetByUrl(photo.imageUrl);
      } else {
        const rel = photo.imageUrl.replace(/^\//, "");
        const filePath = path.join(process.cwd(), "public", rel);
        await unlink(filePath);
      }
    } catch (error) {
      console.error("Error deleting gallery file:", error);
    }

    await prisma.competitionGalleryPhoto.delete({
      where: { id: photoId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("DELETE api/competitions/[id]/gallery/[photoId]/route.ts", error);
  }
}
