export const LOGIN_DISCOVERABLE_ATTEMPTED_KEY = "bluvium:loginDiscoverableAttempted";

/** 描画後にパッシブ discoverable 試行を開始するまでの遅延（ms） */
export const PASSIVE_PASSKEY_DELAY_MS = 400;

export function hasPassivePasskeyLoginBeenAttempted(
  storage: Pick<Storage, "getItem"> = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : { getItem: () => null }
): boolean {
  return storage.getItem(LOGIN_DISCOVERABLE_ATTEMPTED_KEY) === "1";
}

export function shouldAttemptPassivePasskeyLogin(args: {
  supportsPasskey: boolean;
  passkeyRateLimited: boolean;
  storage?: Pick<Storage, "getItem">;
}): boolean {
  if (!args.supportsPasskey || args.passkeyRateLimited) return false;
  if (hasPassivePasskeyLoginBeenAttempted(args.storage)) return false;
  return true;
}

export function markPassivePasskeyLoginAttempted(
  storage: Pick<Storage, "setItem"> = sessionStorage
): void {
  storage.setItem(LOGIN_DISCOVERABLE_ATTEMPTED_KEY, "1");
}
