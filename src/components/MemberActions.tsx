"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isClubAdminRole } from "@/lib/roleScopes";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmAction = "approve" | "reject" | "remove" | "promote" | "demote";

interface MemberActionsProps {
  membershipId: string;
  clubId: string;
  status: string;
  role: string;
  currentUserId: string;
  targetUserId: string;
  currentUserRole: string;
  compact?: boolean;
}

const confirmCopy: Record<
  ConfirmAction,
  { title: string; description: string; confirmLabel: string; destructive?: boolean }
> = {
  approve: {
    title: "参加を承認しますか？",
    description: "このメンバーをクラブの承認済みメンバーとして受け入れます。",
    confirmLabel: "承認する",
  },
  reject: {
    title: "参加を拒否しますか？",
    description: "この申請を拒否します。メンバーには反映されません。",
    confirmLabel: "拒否する",
    destructive: true,
  },
  remove: {
    title: "メンバーを削除しますか？",
    description: "このメンバーをクラブから外します。この操作は取り消せません。",
    confirmLabel: "削除する",
    destructive: true,
  },
  promote: {
    title: "管理者に昇格しますか？",
    description: "このメンバーにクラブ管理者の権限を付与します。",
    confirmLabel: "昇格する",
  },
  demote: {
    title: "一般メンバーに降格しますか？",
    description: "このメンバーから管理者権限を外します。",
    confirmLabel: "降格する",
    destructive: true,
  },
};

export default function MemberActions({
  membershipId,
  clubId,
  status,
  role,
  currentUserId,
  targetUserId,
  currentUserRole,
  compact = false,
}: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (currentUserId === targetUserId) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const isAdmin = isClubAdminRole(currentUserRole);

  const runConfirmed = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setLoading(true);
    try {
      switch (action) {
        case "approve": {
          const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/approve`, {
            method: "POST",
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error((errorData as { error?: string }).error || "承認に失敗しました");
          }
          toast.success("承認しました");
          break;
        }
        case "reject": {
          const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/reject`, {
            method: "POST",
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error((errorData as { error?: string }).error || "拒否に失敗しました");
          }
          toast.success("拒否しました");
          break;
        }
        case "remove": {
          const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error((errorData as { error?: string }).error || "削除に失敗しました");
          }
          toast.success("削除しました");
          break;
        }
        case "promote": {
          const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/role`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "ADMIN" }),
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error((errorData as { error?: string }).error || "役割の変更に失敗しました");
          }
          toast.success("管理者に変更しました");
          break;
        }
        case "demote": {
          const res = await fetch(`/api/clubs/${clubId}/members/${membershipId}/role`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "MEMBER" }),
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error((errorData as { error?: string }).error || "役割の変更に失敗しました");
          }
          toast.success("メンバーに変更しました");
          break;
        }
        default:
          break;
      }
      router.refresh();
    } catch (error) {
      console.error("Member action error:", error);
      toast.error(error instanceof Error ? error.message : "操作に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const copy = confirmAction ? confirmCopy[confirmAction] : null;

  const btnClass = compact ? "h-6 px-1.5 text-[10px]" : "h-8 text-xs";

  return (
    <>
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>キャンセル</AlertDialogCancel>
            <Button
              type="button"
              disabled={loading}
              variant={copy?.destructive ? "destructive" : "default"}
              onClick={() => void runConfirmed()}
            >
              {copy?.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={compact ? "flex flex-wrap justify-end gap-1" : "flex flex-wrap gap-2"}>
        {status === "PENDING" && (
          <>
            <Button
              type="button"
              size="sm"
              variant="default"
              className={btnClass}
              disabled={loading}
              onClick={() => setConfirmAction("approve")}
            >
              承認
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className={btnClass}
              disabled={loading}
              onClick={() => setConfirmAction("reject")}
            >
              拒否
            </Button>
          </>
        )}
        {status === "APPROVED" && (
          <>
            {isAdmin && role === "MEMBER" && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={btnClass}
                disabled={loading}
                onClick={() => setConfirmAction("promote")}
              >
                {compact ? "昇格" : "管理者に昇格"}
              </Button>
            )}
            {isAdmin && role === "ADMIN" && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={btnClass}
                disabled={loading}
                onClick={() => setConfirmAction("demote")}
              >
                {compact ? "降格" : "メンバーに降格"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={btnClass}
              disabled={loading}
              onClick={() => setConfirmAction("remove")}
            >
              削除
            </Button>
          </>
        )}
        {status === "REJECTED" && (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </div>
    </>
  );
}
