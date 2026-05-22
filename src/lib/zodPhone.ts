import { z } from "zod";
import {
  isValidMobileE164,
  isValidPhoneE164,
  normalizeToE164,
  parsePhoneToE164,
  type CountryCode,
} from "@/lib/phone";

const e164Regex = /^\+[1-9]\d{6,14}$/;

function refineE164(
  value: string,
  mobileOnly: boolean
): { ok: true; e164: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: "電話番号を入力してください" };
  }
  const e164 =
    trimmed.startsWith("+") ? trimmed : normalizeToE164(trimmed, "JP");
  if (!e164 || !e164Regex.test(e164)) {
    return { ok: false, message: "有効な電話番号を入力してください" };
  }
  if (mobileOnly && !isValidMobileE164(e164)) {
    return {
      ok: false,
      message: "SMSで認証できる携帯電話番号を入力してください",
    };
  }
  if (!mobileOnly && !isValidPhoneE164(e164)) {
    return { ok: false, message: "有効な電話番号を入力してください" };
  }
  return { ok: true, e164 };
}

export function zE164Mobile(message?: string) {
  return z
    .string()
    .min(1, message ?? "電話番号を入力してください")
    .transform((val, ctx) => {
      const result = refineE164(val, true);
      if (!result.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
        return z.NEVER;
      }
      return result.e164;
    });
}

export function zE164Phone(message?: string) {
  return z
    .string()
    .min(1, message ?? "電話番号を入力してください")
    .transform((val, ctx) => {
      const result = refineE164(val, false);
      if (!result.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
        return z.NEVER;
      }
      return result.e164;
    });
}

export function zE164PhoneOptional() {
  return z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (!val?.trim()) return undefined;
      const result = refineE164(val, false);
      if (!result.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
        return z.NEVER;
      }
      return result.e164;
    });
}

/** 国 + 国内番号ペアから E.164 を検証 */
export function parseAndValidatePhoneInput(
  country: CountryCode,
  national: string,
  mobileOnly: boolean
): { ok: true; e164: string } | { ok: false; message: string } {
  const e164 = parsePhoneToE164(country, national);
  if (!e164) {
    return { ok: false, message: "有効な電話番号を入力してください" };
  }
  if (mobileOnly && !isValidMobileE164(e164)) {
    return {
      ok: false,
      message: "SMSで認証できる携帯電話番号を入力してください",
    };
  }
  if (!mobileOnly && !isValidPhoneE164(e164)) {
    return { ok: false, message: "有効な電話番号を入力してください" };
  }
  return { ok: true, e164 };
}
