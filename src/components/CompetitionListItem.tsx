"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Eye, EyeOff, MapPin, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  const blockRowNavigationRef = useRef(false);
  const [currentStatus, setCurrentStatus] = useState(competition.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const detailHref = `/organizations/${organizationId}/competitions/${competition.id}`;
  const organizationHref = `/organizations/${organizationId}`;

  const navigateToDetail = () => {
    if (blockRowNavigationRef.current || isDeleting || isUpdating) return;
    router.push(detailHref);
  };

  const statusMeta = (() => {
    switch (currentStatus) {
      case "PUBLISHED":
        return {
          label: "公開中",
          className:
            "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
        };
      case "DRAFT":
        return {
          label: "非公開",
          className:
            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
        };
      case "ONGOING":
        return {
          label: "開催中",
          className:
            "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
        };
      case "COMPLETED":
        return {
          label: "終了",
          className:
            "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
        };
      case "CANCELLED":
        return {
          label: "中止",
          className:
            "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
        };
      default:
        return {
          label: currentStatus,
          className:
            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
        };
    }
  })();

  const startDate = new Date(competition.startDate);
  const formattedStartDate = Number.isNaN(startDate.getTime())
    ? "日付未設定"
    : startDate.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  const venueLabel = competition.venue?.trim() || "会場未設定";

  const handleTogglePublish = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isUpdating) return;

    const newStatus = currentStatus === "DRAFT" ? "PUBLISHED" : "DRAFT";
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

      setCurrentStatus(newStatus);
      router.refresh();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("ステータスの更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting || isUpdating) return;

    blockRowNavigationRef.current = true;
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/competitions/${competition.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "大会の削除に失敗しました");
      }

      toast.success("大会を削除しました");
      // ダイアログ閉鎖直後のクリックが背面の行に届き、削除済み大会詳細へ飛ぶのを防ぐ
      router.replace(organizationHref);
      router.refresh();
    } catch (error) {
      console.error("Error deleting competition:", error);
      toast.error(
        error instanceof Error ? error.message : "大会の削除に失敗しました"
      );
    } finally {
      setIsDeleting(false);
      window.setTimeout(() => {
        blockRowNavigationRef.current = false;
      }, 400);
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={navigateToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigateToDetail();
        }
      }}
      className="cursor-pointer rounded-2xl border border-border/90 bg-card p-4 shadow-sm transition-all hover:border-primary/20 hover:bg-muted/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
              {competition.name}
            </h3>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          </div>
          {competition.nameKana && (
            <p className="mt-1 text-sm text-muted-foreground">
              {competition.nameKana}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-primary/70" aria-hidden />
              開催日: {formattedStartDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary/70" aria-hidden />
              {venueLabel}
            </span>
            {competition.category && (
              <span className="rounded-full border border-primary/25 bg-primary/[0.08] px-2 py-0.5 text-xs font-medium text-primary">
                {competition.category}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canEdit && (currentStatus === "DRAFT" || currentStatus === "PUBLISHED") && (
            <Button
              variant={currentStatus === "DRAFT" ? "default" : "outline"}
              size="sm"
              onClick={handleTogglePublish}
              disabled={isUpdating || isDeleting}
            >
              {currentStatus === "DRAFT" ? (
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
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting || isUpdating}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {isDeleting ? "削除中..." : "削除"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>この大会を削除してもよろしいですか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    大会「{competition.name}」を削除します。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleDelete();
                    }}
                    disabled={isDeleting || isUpdating}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
