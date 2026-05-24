/**
 * 電話番号のバリデーションと E.164 形式への変換（国際対応）
 */

import {
  parsePhoneNumberFromString,
  parsePhoneNumberWithError,
  getCountries,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js/max";

export type { CountryCode };

const MOBILE_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

function normalizeDigits(phone: string): string {
  return phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function parseE164(e164: string): PhoneNumber | null {
  const t = e164.trim();
  if (!t) return null;
  try {
    const parsed = parsePhoneNumberWithError(t.startsWith("+") ? t : `+${t}`);
    return parsed.isValid() ? parsed : null;
  } catch {
    return null;
  }
}

function parseNational(country: CountryCode, national: string): PhoneNumber | null {
  const trimmed = national.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (!parsed?.isValid()) return null;
  return parsed;
}

const JP_MOBILE_PREFIXES = ["070", "080", "090"] as const;

function isJpMobileByPrefix(parsed: PhoneNumber): boolean {
  if (parsed.country !== "JP") return false;
  const national = parsed.formatNational().replace(/\D/g, "");
  const prefix = national.slice(0, 3);
  return (JP_MOBILE_PREFIXES as readonly string[]).includes(prefix);
}

function isMobileNumber(parsed: PhoneNumber): boolean {
  const type = parsed.getType();
  if (type && MOBILE_TYPES.has(type)) return true;
  if (!type && parsed.isValid() && isJpMobileByPrefix(parsed)) return true;
  return false;
}

/**
 * 国コード + 国内番号から E.164 を生成
 */
export function parsePhoneToE164(
  country: CountryCode,
  national: string
): string | null {
  const parsed = parseNational(country, national);
  if (!parsed) return null;
  return parsed.format("E.164");
}

/**
 * E.164 をフォーム入力用に分解
 */
export function splitE164ForInput(e164: string): {
  country: CountryCode;
  national: string;
} {
  const parsed = parseE164(e164);
  if (!parsed) {
    return { country: "JP", national: e164.replace(/^\+\d+/, "").trim() };
  }
  return {
    country: parsed.country ?? "JP",
    national: parsed.formatNational().replace(/\D/g, ""),
  };
}

/**
 * E.164 が有効な携帯番号か
 */
export function isValidMobileE164(e164: string): boolean {
  const parsed = parseE164(e164);
  if (!parsed) return false;
  return isMobileNumber(parsed);
}

/**
 * E.164 が有効な電話番号か（固定電話可）
 */
export function isValidPhoneE164(e164: string): boolean {
  return parseE164(e164) !== null;
}

/**
 * 任意の入力文字列を E.164 に正規化（国未指定時は JP をデフォルト）
 */
/** 空文字は null、それ以外は E.164 に正規化 */
export function normalizeOptionalPhoneE164(
  phone: string | null | undefined,
  defaultCountry: CountryCode = "JP"
): string | null {
  const t = phone?.trim();
  if (!t) return null;
  return normalizeToE164(t, defaultCountry);
}

export function normalizeToE164(
  phone: string,
  defaultCountry: CountryCode = "JP"
): string | null {
  const t = phone.trim();
  if (!t) return null;
  if (t.startsWith("+")) {
    const parsed = parseE164(t);
    return parsed?.format("E.164") ?? null;
  }
  return parsePhoneToE164(defaultCountry, t);
}

/**
 * 日本国内携帯番号か（後方互換）
 */
export function isValidJapaneseMobile(phone: string): boolean {
  const e164 = normalizeToE164(phone, "JP");
  if (!e164) return false;
  const parsed = parseE164(e164);
  if (!parsed || parsed.country !== "JP") return false;
  return isMobileNumber(parsed);
}

/**
 * SMS 送信用: E.164 に正規化。解釈不能なら元の文字列。
 */
export function phoneToE164Loose(phone: string): string {
  const t = phone.trim();
  if (!t) return t;
  if (t.startsWith("+")) {
    const parsed = parseE164(t);
    return parsed?.format("E.164") ?? t;
  }
  const e164 = normalizeToE164(t, "JP");
  return e164 ?? t;
}

/**
 * 電話番号を E.164 に変換
 */
export function toE164(phone: string, defaultCountry: CountryCode = "JP"): string {
  const e164 = normalizeToE164(phone, defaultCountry);
  if (!e164) {
    throw new Error("無効な電話番号です");
  }
  return e164;
}

/**
 * E.164 を表示用国内形式に変換
 */
export function toNationalFormat(e164: string): string {
  const parsed = parseE164(e164);
  if (!parsed) return e164;
  return parsed.formatNational();
}

/**
 * 電話番号のマスク
 */
export function maskPhoneNumber(phone: string): string {
  const parsed = parseE164(phone) ?? parsePhoneNumberFromString(phone, "JP");
  if (!parsed?.isValid()) {
    const digits = normalizeDigits(phone);
    if (digits.length >= 7) {
      return `****${digits.slice(-4)}`;
    }
    return phone;
  }
  const e164 = parsed.format("E.164");
  const national = parsed.formatNational().replace(/\D/g, "");
  if (national.length >= 7) {
    const prefixLen = Math.min(4, Math.max(2, national.length - 7));
    const prefix = national.slice(0, prefixLen);
    const suffix = national.slice(-4);
    if (parsed.country === "JP" && national.length === 11) {
      return `${national.slice(0, 3)}-****-${suffix}`;
    }
    return `${e164.slice(0, Math.min(5, e164.length))}****${suffix}`;
  }
  return e164;
}

/** UI 用: ISO 国コード一覧（JP 先頭） */
export function getPhoneCountryCodes(): CountryCode[] {
  const all = getCountries();
  const rest = all.filter((c) => c !== "JP").sort();
  return ["JP", ...rest];
}

/** UI 用: 国名（日本語） */
const countryNameDisplay = new Intl.DisplayNames(["ja"], { type: "region" });

export function getPhoneCountryLabel(country: CountryCode): string {
  try {
    return countryNameDisplay.of(country) ?? country;
  } catch {
    return country;
  }
}

export function getPhoneCountryOptions(): { value: CountryCode; label: string }[] {
  return getPhoneCountryCodes().map((value) => ({
    value,
    label: `${getPhoneCountryLabel(value)} (+${getCountryCallingCode(value)})`,
  }));
}

function getCountryCallingCode(country: CountryCode): string {
  const parsed = parsePhoneNumberFromString("1", country);
  return parsed?.countryCallingCode ?? "";
}

/** 国別プレースホルダ */
export function getNationalPlaceholder(country: CountryCode): string {
  switch (country) {
    case "JP":
      return "09012345678";
    case "US":
    case "CA":
      return "4155552671";
    case "GB":
      return "7911123456";
    case "KR":
      return "1012345678";
    case "AU":
      return "412345678";
    default:
      return "";
  }
}
