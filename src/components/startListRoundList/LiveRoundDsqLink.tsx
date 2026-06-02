"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ResultRound } from "@prisma/client";
import type { LiveRoundContentProps } from "./types";

type StartListMarshal = NonNullable<LiveRoundContentProps["startListMarshal"]>;

export type LiveRoundDsqLinkProps = {
  showDsqManagementLink: boolean;
  marshalRoundMismatch: boolean;
  m: StartListMarshal | null;
  eventId: string;
  marshalRoundForDisplay?: ResultRound | null;
};

export function LiveRoundDsqLink({
  showDsqManagementLink,
  marshalRoundMismatch,
  m,
  eventId,
  marshalRoundForDisplay,
}: LiveRoundDsqLinkProps) {
  return (
    <>
      {showDsqManagementLink && m ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 dark:border-destructive/30 dark:bg-destructive/10">
          <p className="min-w-0 text-[10px] leading-snug text-muted-foreground">
            レーン単位の終了ステータス（欠場・棄権・DNF・失格）の登録・取り消しはこちらから行えます。
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 border-destructive/35 px-2.5 text-[10px] text-destructive hover:bg-destructive/10"
            asChild
          >
            <Link
              href={`/competitions/${m.competitionId}/start-list/${eventId}/dsq?round=${encodeURIComponent(
                marshalRoundForDisplay ?? m.round
              )}`}
              prefetch={false}
            >
              終了ステータス管理
            </Link>
          </Button>
        </div>
      ) : null}
      {marshalRoundMismatch && m ? (
        <p className="rounded-md border border-amber-200/90 bg-amber-50/80 px-2.5 py-2 text-[10px] leading-snug text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          このタブのラウンドはスタートリストスナップショットにまだ含まれていません（API
          は別ラウンドのヒートを返しています）。次ラの生成後にページを更新すると、マーシャル・リザルトと表示が一致します。
        </p>
      ) : null}
    </>
  );
}
