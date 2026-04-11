/**
 * OTP (One-Time Password) 生成・検証ユーティリティ
 */

import bcrypt from 'bcrypt';

/**
 * 6桁のOTPを生成
 * 
 * @returns 6桁の数字文字列
 */
export function generateOTP(): string {
  // 0-999999のランダム数値を6桁にパディング
  const otp = Math.floor(Math.random() * 1000000);
  return otp.toString().padStart(6, '0');
}

/**
 * OTPをbcryptでハッシュ化
 * 
 * @param otp OTP文字列
 * @returns ハッシュ化されたOTP
 */
export async function hashOTP(otp: string): Promise<string> {
  // 高速化のためsaltRounds=10（デフォルト）
  return bcrypt.hash(otp, 10);
}

/**
 * OTPを検証
 * 
 * @param otp 入力されたOTP
 * @param hash 保存されたハッシュ
 * @returns 一致すればtrue
 */
export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(otp, hash);
  } catch (error) {
    console.error('OTP verification error:', error);
    return false;
  }
}

/**
 * OTPの有効期限を計算
 * 
 * @param minutes 有効期限（分）デフォルト5分
 * @returns 有効期限のDateオブジェクト
 */
export function getOTPExpiry(minutes: number = 5): Date {
  const now = new Date();
  return new Date(now.getTime() + minutes * 60 * 1000);
}

/**
 * OTPが有効期限内かチェック
 * 
 * @param expiresAt 有効期限
 * @returns 有効期限内ならtrue
 */
export function isOTPValid(expiresAt: Date): boolean {
  return new Date() < expiresAt;
}

/**
 * セッションの有効期限を計算
 * 
 * @param minutes 有効期限（分）デフォルト30分
 * @returns 有効期限のDateオブジェクト
 */
export function getSessionExpiry(minutes: number = 30): Date {
  const now = new Date();
  return new Date(now.getTime() + minutes * 60 * 1000);
}

/**
 * 再送制限チェック用の時刻を計算
 * 
 * @param seconds 待機秒数 デフォルト60秒
 * @returns 次の送信可能時刻
 */
export function getNextSendTime(seconds: number = 60): Date {
  const now = new Date();
  return new Date(now.getTime() + seconds * 1000);
}

/**
 * 1時間制限のリセット時刻を計算
 * 
 * @returns 1時間後のDateオブジェクト
 */
export function getHourlyResetTime(): Date {
  const now = new Date();
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * 再送可能かチェック
 * 
 * @param lastSentAt 最後に送信した時刻
 * @param cooldownSeconds クールダウン秒数 デフォルト60秒
 * @returns 再送可能ならtrue
 */
export function canResend(lastSentAt: Date, cooldownSeconds: number = 60): boolean {
  const now = new Date();
  const diffMs = now.getTime() - lastSentAt.getTime();
  const diffSec = diffMs / 1000;
  return diffSec >= cooldownSeconds;
}

/**
 * 次に再送可能になるまでの残り秒数を計算
 * 
 * @param lastSentAt 最後に送信した時刻
 * @param cooldownSeconds クールダウン秒数 デフォルト60秒
 * @returns 残り秒数（0以下なら再送可能）
 */
export function getResendCooldown(lastSentAt: Date, cooldownSeconds: number = 60): number {
  const now = new Date();
  const diffMs = now.getTime() - lastSentAt.getTime();
  const diffSec = diffMs / 1000;
  const remaining = cooldownSeconds - diffSec;
  return Math.max(0, Math.ceil(remaining));
}
