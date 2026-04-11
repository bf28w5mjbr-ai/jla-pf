import { normalizeIntegerNumericInput } from "@/lib/numericInput";

/** JLA 発行メンバーID: 半角9桁・先頭3桁は 500 */
export const JLA_MEMBER_NUMBER_REGEX = /^500\d{6}$/;

export function normalizeJlaMemberNumber(value: string) {
  return normalizeIntegerNumericInput(value);
}

export function isValidJlaMemberNumber(value: string) {
  return JLA_MEMBER_NUMBER_REGEX.test(normalizeJlaMemberNumber(value));
}

function normalizeQualificationKind(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-./()（）・]+/g, "");
}

export function isPlayerRegistrationKind(value: string | null | undefined) {
  const normalized = normalizeQualificationKind(value);
  return (
    normalized === "選手登録" ||
    normalized === "playerregistration"
  );
}
