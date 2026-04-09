/**
 * 日本国内携帯電話番号のバリデーションとE.164形式への変換
 */

/**
 * 日本の携帯電話番号プレフィックス
 * 070, 080, 090のみ許可
 */
const MOBILE_PREFIXES = ['070', '080', '090'] as const;

/**
 * 電話番号を正規化（数字のみ抽出）
 */
function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/**
 * 日本国内携帯番号かどうかを検証
 * 
 * 許可形式:
 * - 090-1234-5678
 * - 09012345678
 * - +819012345678
 * 
 * @param phone 電話番号
 * @returns 有効な日本国内携帯番号の場合true
 */
export function isValidJapaneseMobile(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  
  // +81から始まる場合
  if (normalized.startsWith('81')) {
    const withoutCountryCode = normalized.slice(2);
    // +81の後は10桁（先頭0を除く）
    if (withoutCountryCode.length !== 10) return false;
    
    // プレフィックスチェック（70, 80, 90）
    const prefix = '0' + withoutCountryCode.slice(0, 2);
    return (MOBILE_PREFIXES as readonly string[]).includes(prefix);
  }
  
  // 国内形式（0から始まる11桁）
  if (!normalized.startsWith('0')) return false;
  if (normalized.length !== 11) return false;
  
  // プレフィックスチェック（070, 080, 090）
  const prefix = normalized.slice(0, 3);
  return (MOBILE_PREFIXES as readonly string[]).includes(prefix);
}

/**
 * 日本国内携帯番号をE.164形式に変換
 * 
 * @param phone 電話番号
 * @returns E.164形式の電話番号 (+819012345678)
 * @throws {Error} 無効な電話番号の場合
 * 
 * @example
 * toE164("+819012345678") // => "+819012345678"
 * toE164("09012345678")   // => "+819012345678"
 * toE164("090-1234-5678") // => "+819012345678"
 */
/**
 * SMS 送信用: 既に E.164 ならそのまま、国内形式なら toE164、解釈不能なら元の文字列。
 */
export function phoneToE164Loose(phone: string): string {
  const t = phone.trim();
  if (t.startsWith("+")) return t;
  try {
    return toE164(t);
  } catch {
    return t;
  }
}

export function toE164(phone: string): string {
  if (!isValidJapaneseMobile(phone)) {
    throw new Error('無効な日本国内携帯電話番号です');
  }
  
  const normalized = normalizePhoneNumber(phone);
  
  // 既にE.164形式（+81...）
  if (normalized.startsWith('81')) {
    return '+' + normalized;
  }
  
  // 国内形式（0...）→ E.164形式（+81...）
  // 先頭の0を除いて+81を付与
  return '+81' + normalized.slice(1);
}

/**
 * E.164形式を国内形式に変換（表示用）
 * 
 * @param e164 E.164形式の電話番号
 * @returns 国内形式の電話番号（ハイフン付き）
 * 
 * @example
 * toNationalFormat("+819012345678") // => "090-1234-5678"
 */
export function toNationalFormat(e164: string): string {
  const normalized = normalizePhoneNumber(e164);
  
  // +81から始まる場合
  if (normalized.startsWith('81')) {
    const withoutCountryCode = normalized.slice(2);
    const domestic = '0' + withoutCountryCode;
    
    // XXX-XXXX-XXXX形式
    return `${domestic.slice(0, 3)}-${domestic.slice(3, 7)}-${domestic.slice(7)}`;
  }
  
  // 既に国内形式の場合
  if (normalized.length === 11) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  }
  
  return e164;
}

/**
 * 電話番号のマスク（一部を隠す）
 * 
 * @param phone 電話番号
 * @returns マスクされた電話番号
 * 
 * @example
 * maskPhoneNumber("+819012345678") // => "+8190****5678"
 * maskPhoneNumber("090-1234-5678") // => "090-****-5678"
 */
export function maskPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  
  if (normalized.startsWith('81')) {
    // +81形式: +8190****5678
    const prefix = normalized.slice(0, 4);
    const suffix = normalized.slice(-4);
    return `+${prefix}****${suffix}`;
  }
  
  if (normalized.length === 11) {
    // 国内形式: 090-****-5678
    const prefix = normalized.slice(0, 3);
    const suffix = normalized.slice(-4);
    return `${prefix}-****-${suffix}`;
  }
  
  return phone;
}
