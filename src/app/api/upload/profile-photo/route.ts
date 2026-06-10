import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  canUseSupabaseStorage,
  deletePublicAssetByUrl,
  uploadPublicAsset,
} from "@/lib/supabase/storage";
import {
  isProfilePhotoWithinSizeLimit,
  profilePhotoFileTooLargeMessage,
} from "@/lib/profilePhotoUpload";
import { parseProfilePhotoSubjectFromFormData } from "@/lib/profilePhotoUploadSubject";
import { detectProfilePhotoSubjectWithSharp } from "@/lib/profilePhotoSubjectSharp";
import { validateRasterImageBuffer } from "@/lib/uploadValidation";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    
    if (!sess?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!isProfilePhotoWithinSizeLimit(file.size)) {
      return NextResponse.json({ error: profilePhotoFileTooLargeMessage() }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = await validateRasterImageBuffer(buffer);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.message }, { status: 400 });
    }

    let profilePhotoAspectRatio: number | null = null;
    try {
      const sharpMod = await import("sharp");
      const meta = await sharpMod.default(buffer).metadata();
      if (meta.width && meta.height && meta.height > 0) {
        profilePhotoAspectRatio = meta.width / meta.height;
      }
    } catch {
      profilePhotoAspectRatio = null;
    }

    let subject = parseProfilePhotoSubjectFromFormData(formData);
    if (!subject) {
      subject = await detectProfilePhotoSubjectWithSharp(buffer);
    }

    const filename = `${sess.userId}-${Date.now()}.${validated.value.ext}`;
    
    // 保存先ディレクトリ
    const uploadDir = join(process.cwd(), "public", "uploads", "profiles");
    
    // ディレクトリが存在しない場合は作成
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filepath = join(uploadDir, filename);
    let photoUrl = `/uploads/profiles/${filename}`;
    if (canUseSupabaseStorage()) {
      photoUrl = await uploadPublicAsset({
        objectKey: `profiles/${filename}`,
        body: buffer,
        contentType: validated.value.mime,
      });
    } else {
      await writeFile(filepath, buffer);
    }

    // データベースを更新
    await prisma.user.update({
      where: { id: sess.userId },
      data: {
        profile: {
          update: {
            profilePhotoUrl: photoUrl,
            profilePhotoAspectRatio,
            profilePhotoSubjectX: subject?.x ?? null,
            profilePhotoSubjectY: subject?.y ?? null,
            profilePhotoSubjectW: subject?.width ?? null,
            profilePhotoSubjectH: subject?.height ?? null,
          },
        },
      },
    });

    return NextResponse.json({
      url: photoUrl,
      aspectRatio: profilePhotoAspectRatio,
      subject,
    });
  } catch (error) {
    return jsonInternalError500("POST api/upload/profile-photo/route.ts", error);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const sess = token ? await verifySession(token) : null;
    
    if (!sess?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const current = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: { profile: { select: { profilePhotoUrl: true } } },
    });
    if (current?.profile?.profilePhotoUrl?.startsWith("http")) {
      await deletePublicAssetByUrl(current.profile.profilePhotoUrl);
    }

    // データベースを更新（URLをnullに設定）
    await prisma.user.update({
      where: { id: sess.userId },
      data: {
        profile: {
          update: {
            profilePhotoUrl: null,
            profilePhotoAspectRatio: null,
            profilePhotoSubjectX: null,
            profilePhotoSubjectY: null,
            profilePhotoSubjectW: null,
            profilePhotoSubjectH: null,
          },
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonInternalError500("DELETE api/upload/profile-photo/route.ts", error);
  }
}
