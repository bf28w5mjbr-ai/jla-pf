import { detectSubjectRegionFromRgba } from "./profilePhotoSubjectDetect";
import type { ProfilePhotoSubjectRegion } from "./profilePhotoSubject";

const DETECT_MAX_EDGE = 128;

export async function detectProfilePhotoSubjectWithSharp(
  buffer: Buffer
): Promise<ProfilePhotoSubjectRegion | null> {
  try {
    const sharpMod = await import("sharp");
    const { data, info } = await sharpMod
      .default(buffer)
      .resize(DETECT_MAX_EDGE, DETECT_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height) return null;
    return detectSubjectRegionFromRgba(info.width, info.height, data);
  } catch {
    return null;
  }
}
