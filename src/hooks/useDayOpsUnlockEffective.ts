"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  isDayOpsUnlockedClientHint,
  markDayOpsUnlockedClient,
} from "@/lib/dayOpsClientUnlock";

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
  const [clientHint, setClientHint] = useState(false);

  useEffect(() => {
    const hint = isDayOpsUnlockedClientHint(competitionId);
    setClientHint(hint);
    if (hint && !serverUnlocked && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [competitionId, serverUnlocked, router]);

  return serverUnlocked || clientHint;
}

export { markDayOpsUnlockedClient };
