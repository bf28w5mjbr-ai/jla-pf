"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Bill = {
  clubId: string;
  clubName: string;
  teamCount: number;
  teamAmount: number;
  teamStatus: string | null;
  prepaidAmount: number;
  prepaidStatus: string | null;
  finalizedAt: string | null;
  paidAt: string | null;
};

type Props = {
  competitionId: string;
  bills: Bill[];
  canFinalize: boolean;
};

const formatCurrency = (value: number) => new Intl.NumberFormat("ja-JP").format(value);

const statusLabel = (status: string | null, finalizedAt: string | null) => {
  if (status === "SUCCEEDED") return "支払済み";
  if (status === "REFUNDED") return "返金済み";
  if (status === "FAILED") return "請求失敗";
  if (status === "DISPUTED") return "要確認（異議）";
  if (status === "EXPIRED") return "期限切れ";
  if (status === "PENDING" && finalizedAt) return "決済待ち";
  if (finalizedAt) return "請求確定済み";
  return "未確定";
};

export default function CompetitionTeamBillingManager({
  competitionId,
  bills,
  canFinalize,
}: Props) {
  const [finalizingClubId, setFinalizingClubId] = useState<string | null>(null);
  const [isFinalizingAll, setIsFinalizingAll] = useState(false);

  const finalize = async (clubId?: string) => {
    try {
      if (clubId) {
        setFinalizingClubId(clubId);
      } else {
        setIsFinalizingAll(true);
      }

      const response = await fetch(`/api/competitions/${competitionId}/team-billing/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clubId ? { clubId } : {}),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "請求確定に失敗しました");
      }

      toast.success(data.message || "チーム請求を確定しました");
      window.location.reload();
    } catch (error) {
      console.error("Team billing finalize error:", error);
      toast.error(error instanceof Error ? error.message : "請求確定に失敗しました");
    } finally {
      setFinalizingClubId(null);
      setIsFinalizingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          エントリー期間中はクラブがそのまま決済できます。締切後に金額を確定し直す・未払いを促すときに、ここからクラブごと（または一括）で請求を確定してください。
        </p>
        <Button type="button" onClick={() => finalize()} disabled={!canFinalize || isFinalizingAll}>
          {isFinalizingAll ? "確定中..." : "全クラブ分を確定"}
        </Button>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          チーム請求対象のクラブはまだありません。
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill) => (
            <div
              key={bill.clubId}
              className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {bill.clubName}
                  </p>
                  <p className="text-sm text-gray-500">登録チーム数: {bill.teamCount}</p>
                  <p className="text-sm text-gray-500">
                    チーム請求: {statusLabel(bill.teamStatus, bill.finalizedAt)}
                  </p>
                  {bill.prepaidAmount > 0 ? (
                    <p className="text-sm text-gray-500">
                      個人枠請求: {statusLabel(bill.prepaidStatus, bill.finalizedAt)}
                    </p>
                  ) : null}
                  {bill.finalizedAt && (
                    <p className="text-xs text-gray-500">
                      確定日時: {new Date(bill.finalizedAt).toLocaleString("ja-JP")}
                    </p>
                  )}
                  {bill.paidAt && (
                    <p className="text-xs text-gray-500">
                      支払完了: {new Date(bill.paidAt).toLocaleString("ja-JP")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    チーム ¥{formatCurrency(bill.teamAmount)}
                  </p>
                  {bill.prepaidAmount > 0 ? (
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      個人枠 ¥{formatCurrency(bill.prepaidAmount)}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => finalize(bill.clubId)}
                    disabled={!canFinalize || finalizingClubId === bill.clubId}
                  >
                    {finalizingClubId === bill.clubId ? "確定中..." : "このクラブを確定"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
