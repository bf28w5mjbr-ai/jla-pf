"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { appRoutes } from "@/lib/appRoutes";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";

interface JoinClubFormProps {
  club: {
    id: string;
    name: string;
    officeAddress: string | null;
    status: string;
  };
}

export default function JoinClubForm({ club }: JoinClubFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/clubs/${club.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "参加申請に失敗しました");
        return;
      }

      toast.success(data.message || "参加申請を送りました。");
      router.push(appRoutes.clubs.list());
      router.refresh();
    } catch (err) {
      console.error("Join club error:", err);
      toast.error("参加に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <AutofillSyncForm onSubmit={handleSubmit} className="space-y-6">
          {/* クラブ情報 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {club.name}
              </h3>
              {club.officeAddress && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  📍 {club.officeAddress}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-4">
              <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2">
                📋 参加について
              </h3>
              <ul className="text-xs text-orange-800 dark:text-orange-200 space-y-1 list-disc list-inside">
                <li>参加確定後、すぐにメンバーとして扱われます</li>
                <li>所属の解除はクラブ管理者がメンバー管理から行います</li>
              </ul>
            </div>
          </div>

          {/* ボタン */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "処理中..." : "このクラブに参加"}
            </Button>
          </div>
        </AutofillSyncForm>
      </CardContent>
    </Card>
  );
}
