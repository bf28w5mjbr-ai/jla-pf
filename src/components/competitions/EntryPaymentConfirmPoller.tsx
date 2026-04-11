"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 4000;
const MAX_REFRESHES = 30;

/**
 * Webhook 反映が遅い／ローカルで stripe listen 未起動で戻ってきた後に、
 * ユーザーが手動更新しなくても状態が変わるよう server を再取得する。
 */
export function EntryPaymentConfirmPoller({ active }: { active: boolean }) {
  const router = useRouter();
  const ticks = useRef(0);

  useEffect(() => {
    if (!active) return;
    ticks.current = 0;
    const id = setInterval(() => {
      ticks.current += 1;
      router.refresh();
      if (ticks.current >= MAX_REFRESHES) {
        clearInterval(id);
      }
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  if (!active) return null;

  return (
    <p className="text-xs text-muted-foreground">
      入金の反映を待っています。しばらくお待ちいただくか、更新されない場合はページを再読み込みしてください。
    </p>
  );
}
