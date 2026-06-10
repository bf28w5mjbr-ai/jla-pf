import {
  normalizeProfilePhotoSubjectRegion,
  type ProfilePhotoSubjectRegion,
} from "./profilePhotoSubject";

function parseOptionalFloat(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseProfilePhotoSubjectFromFormData(
  formData: FormData
): ProfilePhotoSubjectRegion | null {
  const x = parseOptionalFloat(formData.get("subjectX"));
  const y = parseOptionalFloat(formData.get("subjectY"));
  const width = parseOptionalFloat(formData.get("subjectWidth"));
  const height = parseOptionalFloat(formData.get("subjectHeight"));
  if (x == null || y == null || width == null || height == null) return null;
  return normalizeProfilePhotoSubjectRegion({ x, y, width, height });
}
