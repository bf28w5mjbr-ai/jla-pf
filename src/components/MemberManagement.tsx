"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { membershipRoleLabelJa } from "@/lib/membershipDisplay";

type SearchUser = {
  id: string;
  familyName: string;
  givenName: string;
  email: string;
};
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
  const [addQuery, setAddQuery] = useState("");
  const [candidates, setCandidates] = useState<SearchUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addRole, setAddRole] = useState("MEMBER");
  const [addLoading, setAddLoading] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<
    {
      id: string;
      role: string;
      invitedUser: {
        id: string;
        email: string;
        profile: { familyName: string | null; givenName: string | null } | null;
      };
    }[]
  >([]);
  const [cancelInviteLoading, setCancelInviteLoading] = useState<string | null>(null);

  const existingMemberUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members]
  );

  const visibleCandidates = useMemo(
    () => candidates.filter((u) => !existingMemberUserIds.has(u.id)),
    [candidates, existingMemberUserIds]
  );

  useEffect(() => {
    if (!addDialogOpen) return;

    const q = addQuery.trim();
    if (q.length < 2) {
      setCandidates([]);
      setSearchLoading(false);
      return;
    }

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/members/search?q=${encodeURIComponent(q)}`,
          { signal: ac.signal }
        );
        const data = (await res.json()) as { users?: SearchUser[]; error?: string };
        if (!res.ok) {
          throw new Error(data.error || "検索に失敗しました");
        }
        if (!ac.signal.aborted) {
          setCandidates(Array.isArray(data.users) ? data.users : []);
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        console.error("Member search error:", e);
        if (!ac.signal.aborted) {
          setCandidates([]);
          toast.error(e instanceof Error ? e.message : "検索に失敗しました");
        }
      } finally {
        if (!ac.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      ac.abort();
      setSearchLoading(false);
    };
  }, [addQuery, addDialogOpen, organizationId]);

  const [changeRoleLoading, setChangeRoleLoading] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const canAddMembers = isOrgAdminRole(userRole);

  useEffect(() => {
    if (!canAddMembers) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/organizations/${organizationId}/admin-invitations`);
        const data = (await res.json()) as { invitations?: typeof pendingInvitations };
        if (!cancelled && res.ok) {
          setPendingInvitations(data.invitations ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, canAddMembers, members.length, addDialogOpen]);

  // メンバー追加
  const handleAddMember = async () => {
    if (!selectedUser) {
      toast.error("候補からユーザーを選択してください");
      return;
    }

    try {
      setAddLoading(true);

      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          role: addRole,
        }),
      });

      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "招待の送信に失敗しました");
      }

      toast.success(data.message ?? "招待を送信しました");
      const invRes = await fetch(`/api/organizations/${organizationId}/admin-invitations`);
      const invData = (await invRes.json()) as { invitations?: typeof pendingInvitations };
      if (invRes.ok) setPendingInvitations(invData.invitations ?? []);
      setAddDialogOpen(false);
      setAddQuery("");
      setCandidates([]);
      setSelectedUser(null);
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
        <Dialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (!open) {
              setAddQuery("");
              setCandidates([]);
              setSelectedUser(null);
              setAddRole("MEMBER");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              招待を送る
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>管理メンバーを招待</DialogTitle>
              <DialogDescription>
                氏名またはメールの一部（2文字以上）で検索し、候補を選ぶと招待が送られます。相手の承諾後にメンバーとして表示されます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="member-search">ユーザー検索</Label>
                <Input
                  id="member-search"
                  type="search"
                  autoComplete="off"
                  value={addQuery}
                  onChange={(e) => {
                    setAddQuery(e.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder="例: 山田 / yamada@…"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  2文字未満では検索しません。同名の区別にメールを表示します。
                </p>
              </div>

              {addQuery.trim().length >= 2 ? (
                <div className="rounded-md border border-border bg-muted/30">
                  {searchLoading ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      検索中…
                    </div>
                  ) : visibleCandidates.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      {candidates.length === 0
                        ? "該当するユーザーがいません。"
                        : "いずれも既にこの団体のメンバーです。"}
                    </p>
                  ) : (
                    <ul className="max-h-52 divide-y divide-border overflow-y-auto">
                      {visibleCandidates.map((u) => {
                        const isSelected = selectedUser?.id === u.id;
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedUser(u)}
                              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/80 ${
                                isSelected ? "bg-muted font-medium" : ""
                              }`}
                            >
                              <span>
                                {u.familyName} {u.givenName}
                              </span>
                              <span className="text-xs text-muted-foreground">{u.email}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              {selectedUser ? (
                <p className="text-sm text-foreground">
                  選択中:{" "}
                  <span className="font-medium">
                    {selectedUser.familyName} {selectedUser.givenName}
                  </span>
                  <span className="text-muted-foreground">（{selectedUser.email}）</span>
                </p>
              ) : null}

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
              <Button
                onClick={handleAddMember}
                disabled={addLoading || !selectedUser}
              >
                {addLoading ? "送信中..." : "招待を送る"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canAddMembers && pendingInvitations.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-foreground">承諾待ちの招待</p>
          <ul className="space-y-2">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {inv.invitedUser.profile?.familyName} {inv.invitedUser.profile?.givenName}
                  <span className="text-muted-foreground">（{inv.invitedUser.email}）</span>
                  <Badge variant="outline" className="ml-2 font-normal">
                    {membershipRoleLabelJa(inv.role)}
                  </Badge>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cancelInviteLoading === inv.id}
                  onClick={async () => {
                    setCancelInviteLoading(inv.id);
                    try {
                      const res = await fetch(
                        `/api/organizations/${organizationId}/admin-invitations/${inv.id}`,
                        { method: "DELETE" }
                      );
                      if (!res.ok) {
                        const j = (await res.json()) as { error?: string };
                        throw new Error(j.error || "取消に失敗しました");
                      }
                      setPendingInvitations((prev) => prev.filter((x) => x.id !== inv.id));
                      toast.success("招待を取り消しました");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "取消に失敗しました");
                    } finally {
                      setCancelInviteLoading(null);
                    }
                  }}
                >
                  取消
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* メンバー一覧 */}
      <div className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const canChangeRole = canAddMembers && !isSelf;
          const canRemove = canAddMembers && !isSelf;

          return (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {member.user.familyName} {member.user.givenName}
                  {isSelf && (
                    <span className="ml-2 text-sm text-muted-foreground">（あなた）</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{member.user.email}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
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
                  <Badge
                    variant={member.role === "ADMIN" ? "default" : "secondary"}
                    className="font-normal"
                  >
                    {membershipRoleLabelJa(member.role)}
                  </Badge>
                )}

                {canRemove && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!!removeLoading}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="メンバーを削除"
                        aria-label="メンバーを削除"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
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
