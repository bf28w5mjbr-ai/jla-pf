"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";

type Competition = {
  id: string;
  name: string;
  nameKana: string | null;
  startDate: Date;
  venue: string;
  category: string | null;
  status: string;
};

type Props = {
  competition: Competition;
  organizationId: string;
  canEdit: boolean;
};

export default function CompetitionListItem({ competition, organizationId, canEdit }: Props) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleTogglePublish = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isUpdating) return;

    const newStatus = competition.status === "DRAFT" ? "PUBLISHED" : "DRAFT";
    const confirmMessage = newStatus === "PUBLISHED" 
      ? "この大会を公開しますか？\n一般ユーザーに大会情報が表示されるようになります。"
      : "この大会を非公開にしますか？\n一般ユーザーから見えなくなります。";

    if (!confirm(confirmMessage)) return;

    setIsUpdating(true);

    try {
      const response = await fetch(`/api/competitions/${competition.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("ステータスの更新に失敗しました");
      }

      router.refresh();
    } catch (error) {
      console.error("Error updating status:", error);
      alert("ステータスの更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="block p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/organizations/${organizationId}/competitions/${competition.id}`}
          className="flex-1 hover:opacity-80 transition"
        >
          <h3 className="font-semibold text-lg">
            {competition.name}
          </h3>
          {competition.nameKana && (
            <p className="text-sm text-gray-500 mt-1">
              {competition.nameKana}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>📅 {new Date(competition.startDate).toLocaleDateString("ja-JP")}</span>
            <span>📍 {competition.venue}</span>
            {competition.category && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                {competition.category}
              </span>
            )}
          </div>
        </Link>
        
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href={`/organizations/${organizationId}/competitions/${competition.id}/entries`}>
              <Button variant="outline" size="sm" className="gap-1">
                <ListChecks className="h-3 w-3" />
                状況
              </Button>
            </Link>
          )}
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
              competition.status === "PUBLISHED"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : competition.status === "DRAFT"
                ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                : competition.status === "ONGOING"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                : competition.status === "COMPLETED"
                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {competition.status === "DRAFT" ? "下書き" :
             competition.status === "PUBLISHED" ? "公開中" :
             competition.status === "ONGOING" ? "開催中" :
             competition.status === "COMPLETED" ? "終了" :
             competition.status === "CANCELLED" ? "中止" :
             competition.status}
          </span>

          {canEdit && (competition.status === "DRAFT" || competition.status === "PUBLISHED") && (
            <Button
              variant={competition.status === "DRAFT" ? "default" : "outline"}
              size="sm"
              onClick={handleTogglePublish}
              disabled={isUpdating}
            >
              {competition.status === "DRAFT" ? (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  公開
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  非公開
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
