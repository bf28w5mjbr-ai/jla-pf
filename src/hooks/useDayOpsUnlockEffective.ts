"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  isDayOpsUnlockedClientHint,
  markDayOpsUnlockedClient,
} from "@/lib/dayOpsClientUnlock";

function subscribeDayOpsUnlockHint(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * サーバー検証（Cookie）と sessionStorage のヒントを統合する。
 * Cookie はあるが RSC キャッシュが古いとき、router.refresh() で再検証する。
 */
export function useDayOpsUnlockEffective(
  competitionId: string,
  serverUnlocked: boolean
): boolean {
  const router = useRouter();
  const refreshedRef = useRef(false);
  const clientHint = useSyncExternalStore(
    subscribeDayOpsUnlockHint,
    () => isDayOpsUnlockedClientHint(competitionId),
    () => false
  );

  useEffect(() => {
    if (clientHint && !serverUnlocked && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [clientHint, serverUnlocked, router]);

  return serverUnlocked || clientHint;
}

export { markDayOpsUnlockedClient };
