export type PasskeyLoginAvailabilityUser = {
  _count: { passkeyCredentials: number };
} | null;

/** 未登録メールとパスキー0件はどちらも false（列挙を抑える） */
export function resolvePasskeyLoginOffered(user: PasskeyLoginAvailabilityUser): boolean {
  return user != null && user._count.passkeyCredentials > 0;
}
