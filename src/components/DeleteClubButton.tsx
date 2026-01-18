"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type DeleteClubButtonProps = {
  clubId: string;
  clubName: string;
};

export default function DeleteClubButton({
  clubId,
  clubName,
}: DeleteClubButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmName !== clubName) {
      toast.error("クラブ名が一致しません");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/clubs/${clubId}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete club");
      }

      toast.success("クラブを削除しました");
      router.push("/clubs");
    } catch (error) {
      console.error("Delete club error:", error);
      toast.error(
        error instanceof Error ? error.message : "クラブの削除に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!showConfirm) {
    return (
      <Button
        variant="destructive"
        onClick={() => setShowConfirm(true)}
      >
        クラブを削除
      </Button>
    );
  }

  return (
    <Card className="p-6 border-red-300 bg-red-50 dark:bg-red-950/20">
      <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-4">
        クラブを削除しますか？
      </h3>
      <div className="space-y-4">
        <div className="text-sm text-red-700 dark:text-red-400 space-y-2">
          <p>この操作は取り消せません。以下のデータがすべて削除されます：</p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>すべてのメンバーシップ</li>
            <li>すべてのお知らせ</li>
            <li>すべての活動記録</li>
            <li>クラブの設定情報</li>
          </ul>
        </div>
        <div>
          <Label htmlFor="confirmName" className="text-red-800 dark:text-red-300">
            削除を確定するには、クラブ名「{clubName}」を入力してください
          </Label>
          <Input
            id="confirmName"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={clubName}
            className="mt-2"
          />
        </div>
        <div className="flex gap-3">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading || confirmName !== clubName}
          >
            {loading ? "削除中..." : "削除を確定"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowConfirm(false);
              setConfirmName("");
            }}
            disabled={loading}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </Card>
  );
}
