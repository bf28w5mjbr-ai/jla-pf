import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEntryUserFacingStatus } from "@/lib/entryFinalization";
import type { EntryHistoryRow } from "@/lib/entryHistory";

type Props = {
  entries: EntryHistoryRow[];
  /** クラブ文脈のとき説明文に使う */
  context?: "personal" | "club";
  clubName?: string | null;
};

export default function EntryHistoryList({ entries, context = "personal", clubName }: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>エントリー履歴</CardTitle>
        {context === "club" && clubName ? (
          <p className="text-sm text-muted-foreground">
            「{clubName}」を所属として提出したエントリーのみ表示しています。
            <Button variant="link" className="ml-1 h-auto min-h-0 p-0 text-primary" asChild>
              <Link href={appRoutes.me.entries()}>すべての履歴</Link>
            </Button>
            を開くこともできます。
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-6 text-sm text-muted-foreground">
            {context === "club"
              ? "このクラブを所属として提出したエントリーはまだありません。"
              : "まだエントリー履歴がありません。"}
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const checkout = entry.checkoutSessions[0];
              const payload =
                checkout?.payload && typeof checkout.payload === "object"
                  ? (checkout.payload as Record<string, unknown>)
                  : null;
              const userStatus = getEntryUserFacingStatus({
                status: entry.status,
                totalFee: entry.totalFee,
                checkoutSessions: entry.checkoutSessions.map((s) => ({ status: s.status })),
              });
              const paymentStatus =
                entry.status === "CANCELLED"
                  ? {
                      label:
                        typeof payload?.refundedAt === "string" || entry.totalFee === 0
                          ? "返金 / 取消済み"
                          : "取消済み",
                      icon: CheckCircle2,
                      color: "text-muted-foreground",
                    }
                  : userStatus.businessEstablished
                    ? { label: userStatus.userLabel, icon: CheckCircle2, color: "text-emerald-600" }
                    : { label: userStatus.userLabel, icon: Clock, color: "text-muted-foreground" };
              const StatusIcon = paymentStatus.icon;

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/80 bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{entry.competition.name}</p>
                      <p className="text-sm text-muted-foreground">
                        受付日: {new Date(entry.createdAt).toLocaleDateString("ja-JP")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        状態: {entry.status === "CANCELLED" ? "取消済み" : userStatus.userLabel}
                      </p>
                      {entry.competition.requireClubMembership && entry.club && (
                        <p className="text-sm text-muted-foreground">所属クラブ: {entry.club.name}</p>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">参加費: ¥{entry.totalFee.toLocaleString()}</p>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <StatusIcon className={`h-4 w-4 ${paymentStatus.color}`} aria-hidden />
                        <span>{paymentStatus.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <Link href={appRoutes.competitions.entry(entry.competition.id)}>
                        詳細を見る
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
