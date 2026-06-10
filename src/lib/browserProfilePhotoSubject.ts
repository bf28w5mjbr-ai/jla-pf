import { detectSubjectRegionFromRgba } from "./profilePhotoSubjectDetect";
import type { ProfilePhotoSubjectRegion } from "./profilePhotoSubject";

const DETECT_MAX_EDGE = 128;

export async function detectProfilePhotoSubjectInBrowser(
  file: File
): Promise<ProfilePhotoSubjectRegion | null> {
  if (!file.type.startsWith("image/")) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const scale = DETECT_MAX_EDGE / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
    const height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return detectSubjectRegionFromRgba(width, height, imageData.data);
  } finally {
    bitmap.close();
  }
}

export function appendProfilePhotoSubjectToFormData(
  formData: FormData,
  subject: ProfilePhotoSubjectRegion | null
): void {
  if (!subject) return;
  formData.append("subjectX", String(subject.x));
  formData.append("subjectY", String(subject.y));
  formData.append("subjectWidth", String(subject.width));
  formData.append("subjectHeight", String(subject.height));
}
