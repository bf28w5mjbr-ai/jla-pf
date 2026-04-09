"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type MemberOption = {
  userId: string;
  name: string;
};

interface ClubRepresentativeSelectorProps {
  clubId: string;
  currentRepresentativeUserId: string | null;
  members: MemberOption[];
  isClubAdmin: boolean;
}

export default function ClubRepresentativeSelector({
  clubId,
  currentRepresentativeUserId,
  members,
  isClubAdmin,
}: ClubRepresentativeSelectorProps) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState(currentRepresentativeUserId ?? members[0]?.userId ?? "");
  const [saving, setSaving] = useState(false);

  const currentRepresentativeName = useMemo(() => {
    const current = members.find((member) => member.userId === currentRepresentativeUserId);
    return current?.name ?? "未設定";
  }, [currentRepresentativeUserId, members]);

  const isUnchanged =
    (currentRepresentativeUserId ?? "") === selectedUserId || selectedUserId.length === 0;

  const handleSave = async () => {
    if (!isClubAdmin || !selectedUserId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/representative`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ representativeUserId: selectedUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "代表者の更新に失敗しました");
        return;
      }
      toast.success("代表者を更新しました");
      router.refresh();
    } catch (error) {
      console.error("Update representative error:", error);
      toast.error("代表者の更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">代表者</p>
        <p className="text-xs text-muted-foreground">現在: {currentRepresentativeName}</p>
      </div>

      {isClubAdmin ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="club-representative">代表者を選択</Label>
            <select
              id="club-representative"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={saving || members.length === 0}
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={handleSave} disabled={saving || isUnchanged}>
            {saving ? "更新中..." : "代表者を更新"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          代表者の変更はクラブ管理者のみ実行できます。
        </p>
      )}
    </div>
  );
}

