const FW_DIGIT0 = 0xff10;
const HW_DIGIT0 = 0x30;

/**
 * 全角数字（U+FF10–FF19）、全角マイナス（U+FF0D）、全角ドット（U+FF0E）、
 * マイナス記号（U+2212）を半角に寄せる。それ以外はそのまま。
 */
export function toHalfWidthDigits(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= FW_DIGIT0 && code <= FW_DIGIT0 + 9) {
      out += String.fromCharCode(code - (FW_DIGIT0 - HW_DIGIT0));
      continue;
    }
    if (code === 0xff0d || code === 0x2212) {
      out += "-";
      continue;
    }
    if (code === 0xff0e) {
      out += ".";
      continue;
    }
    out += value[i];
  }
  return out;
}

/** 半角 0–9 のみ（全角数字は先に半角化してから抽出） */
export function normalizeIntegerNumericInput(value: string): string {
  return toHalfWidthDigits(value).replace(/\D/g, "");
}

/**
 * 先頭のマイナス（任意）・整数部・小数点以下（任意）のみ許可。
 * 小数点は高々1つ。
 */
export function normalizeDecimalNumericInput(value: string): string {
  const s = toHalfWidthDigits(value);
  let out = "";
  let i = 0;
  if (s[i] === "-") {
    out = "-";
    i += 1;
  }
  let seenDot = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (ch === "." && !seenDot) {
      seenDot = true;
      out += ".";
    }
  }
  if (out === "-") return "";
  return out;
}
