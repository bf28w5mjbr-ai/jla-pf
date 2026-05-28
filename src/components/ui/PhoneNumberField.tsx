"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fieldHintClass } from "@/lib/explanation";
import {
  type CountryCode,
  parsePhoneToE164,
  splitE164ForInput,
  getPhoneCountryOptions,
  getNationalPlaceholder,
} from "@/lib/phone";
import { parseAndValidatePhoneInput } from "@/lib/zodPhone";

export type PhoneNumberFieldProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (e164: string) => void;
  mobileOnly?: boolean;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  className?: string;
};

export function PhoneNumberField({
  id = "phone",
  label = "電話番号",
  value,
  onChange,
  mobileOnly = false,
  required = false,
  disabled = false,
  hint,
  className,
}: PhoneNumberFieldProps) {
  const countryOptions = useMemo(() => getPhoneCountryOptions(), []);
  const external = useMemo(() => splitE164ForInput(value || ""), [value]);
  const [draft, setDraft] = useState<{ country: CountryCode; national: string } | null>(null);
  const draftE164 = draft ? parsePhoneToE164(draft.country, draft.national) ?? "" : null;
  const useDraft = draft !== null && draftE164 === (value || "");
  const country = useDraft ? draft.country : external.country;
  const national = useDraft ? draft.national : external.national;

  const emitChange = (nextCountry: CountryCode, nextNational: string) => {
    const e164 = parsePhoneToE164(nextCountry, nextNational);
    onChange(e164 ?? "");
  };

  const handleCountryChange = (next: string) => {
    const c = next as CountryCode;
    const nextNational = national;
    setDraft({ country: c, national: nextNational });
    emitChange(c, nextNational);
  };

  const handleNationalChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "");
    setDraft({ country, national: digits });
    emitChange(country, digits);
  };

  const defaultHint =
    country === "JP"
      ? mobileOnly
        ? "携帯電話番号（ハイフンなし）"
        : "ハイフンなしで入力"
      : mobileOnly
        ? "携帯電話番号（国番号は上で選択）"
        : "電話番号（国番号は上で選択）";

  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </Label>
      ) : null}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Select
          value={country}
          onValueChange={handleCountryChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-full sm:w-[min(100%,280px)]" aria-label="国・地域">
            <SelectValue placeholder="国を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {countryOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={getNationalPlaceholder(country)}
          value={national}
          onChange={(e) => handleNationalChange(e.target.value)}
          required={required}
          disabled={disabled}
          className="flex-1"
        />
      </div>
      <p className={fieldHintClass("compact")}>{hint ?? defaultHint}</p>
    </div>
  );
}

/** クライアント送信前の検証 */
export function validatePhoneFieldValue(
  e164: string,
  mobileOnly: boolean
): string | null {
  if (!e164.trim()) return "電話番号を入力してください";
  const split = splitE164ForInput(e164);
  const result = parseAndValidatePhoneInput(
    split.country,
    split.national,
    mobileOnly
  );
  return result.ok ? null : result.message;
}
