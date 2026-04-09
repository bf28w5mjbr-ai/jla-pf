"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { UserPlus, Trash2 } from "lucide-react";
import { isOrgAdminRole, normalizeOrgRoleForWrite } from "@/lib/roleScopes";

type Member = {
  id: string;
  role: string;
  userId: string;
  user: {
    id: string;
    familyName: string | null;
    givenName: string | null;
    email: string;
  };
};

type MemberManagementProps = {
  organizationId: string;
  members: Member[];
  userRole: string;
  currentUserId: string;
  onUpdate: () => void;
};

export default function MemberManagement({
  organizationId,
  members,
  userRole,
  currentUserId,
  onUpdate,
}: MemberManagementProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("MEMBER");
  const [addLoading, setAddLoading] = useState(false);

  const [changeRoleLoading, setChangeRoleLoading] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const canAddMembers = isOrgAdminRole(userRole);

  // メンバー追加
  const handleAddMember = async () => {
    if (!addEmail.trim()) {
      toast.error("メールアドレスを入力してください");
      return;
    }

    try {
      setAddLoading(true);

      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail,
          role: addRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "メンバーの追加に失敗しました");
      }

      toast.success("メンバーを追加しました");
      setAddDialogOpen(false);
      setAddEmail("");
      setAddRole("MEMBER");
      onUpdate();
    } catch (error) {
      console.error("Add member error:", error);
      toast.error(
        error instanceof Error ? error.message : "メンバーの追加に失敗しました"
      );
    } finally {
      setAddLoading(false);
    }
  };

  // 役割変更
  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      setChangeRoleLoading(memberId);

      const response = await fetch(
        `/api/organizations/${organizationId}/members/${memberId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: normalizeOrgRoleForWrite(newRole) }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "役割の変更に失敗しました");
      }

      toast.success("役割を変更しました");
      onUpdate();
    } catch (error) {
      console.error("Change role error:", error);
      toast.error(
        error instanceof Error ? error.message : "役割の変更に失敗しました"
      );
    } finally {
      setChangeRoleLoading(null);
    }
  };

  // メンバー削除
  const handleRemoveMember = async (memberId: string) => {
    try {
      setRemoveLoading(memberId);

      const response = await fetch(
        `/api/organizations/${organizationId}/members/${memberId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "メンバーの削除に失敗しました");
      }

      toast.success("メンバーを削除しました");
      onUpdate();
    } catch (error) {
      console.error("Remove member error:", error);
      toast.error(
        error instanceof Error ? error.message : "メンバーの削除に失敗しました"
      );
    } finally {
      setRemoveLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* メンバー追加ボタン */}
      {canAddMembers && (
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              メンバーを追加
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>メンバーを追加</DialogTitle>
              <DialogDescription>
                追加したいユーザーのメールアドレスを入力してください
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label htmlFor="role">役割</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">メンバー</SelectItem>
                    <SelectItem value="ADMIN">管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={addLoading}
              >
                キャンセル
              </Button>
              <Button onClick={handleAddMember} disabled={addLoading}>
                {addLoading ? "追加中..." : "追加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* メンバー一覧 */}
      <div className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const canChangeRole = canAddMembers && !isSelf;
          const canRemove = canAddMembers && !isSelf;

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex-1">
                <p className="font-medium">
                  {member.user.familyName} {member.user.givenName}
                  {isSelf && (
                    <span className="text-sm text-gray-500 ml-2">（あなた）</span>
                  )}
                </p>
                <p className="text-sm text-gray-500">{member.user.email}</p>
              </div>

              <div className="flex items-center gap-2">
                {/* 役割バッジ or 役割変更セレクト */}
                {canChangeRole ? (
                  <Select
                    value={member.role}
                    onValueChange={(value: string) => handleChangeRole(member.id, value)}
                    disabled={!!changeRoleLoading}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">メンバー</SelectItem>
                      <SelectItem value="ADMIN">管理者</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                      member.role === "ADMIN"
                        ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {member.role}
                  </span>
                )}

                {/* 削除ボタン */}
                {canRemove && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!!removeLoading}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>メンバーを削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                          {member.user.familyName} {member.user.givenName} を団体から削除します。
                          この操作は取り消せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            handleRemoveMember(member.id)
                          }
                          className="bg-red-600 hover:bg-red-700"
                        >
                          削除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
