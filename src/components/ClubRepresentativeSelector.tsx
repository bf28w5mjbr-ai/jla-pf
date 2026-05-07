"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
  /**
   * `members` に現代表のユーザーがいない場合の表示名（DB の代表者氏名など）
   */
  representativeNameFallback?: string | null;
  /** ヒーロー内のコンパクト表示 vs 従来のカード */
  layout?: "card" | "inline";
}

export default function ClubRepresentativeSelector({
  clubId,
  currentRepresentativeUserId,
  members,
  isClubAdmin,
  representativeNameFallback,
  layout = "card",
}: ClubRepresentativeSelectorProps) {
  const router = useRouter();
  const selectId = useId();
  const [selectedUserId, setSelectedUserId] = useState(
    currentRepresentativeUserId ?? members[0]?.userId ?? "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedUserId(currentRepresentativeUserId ?? members[0]?.userId ?? "");
  }, [currentRepresentativeUserId, members]);

  const displayRepresentativeName = useMemo(() => {
    if (currentRepresentativeUserId) {
      const fromMember = members.find((m) => m.userId === currentRepresentativeUserId);
      if (fromMember?.name?.trim()) return fromMember.name.trim();
    }
    const fb = representativeNameFallback?.trim();
    if (fb) return fb;
    return "未設定";
  }, [currentRepresentativeUserId, members, representativeNameFallback]);

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

  const nameBlock = (
    <div className="min-w-0 pt-0.5">
      <span className="text-[11px] font-medium text-muted-foreground">代表者</span>
      <p className="font-medium text-foreground">{displayRepresentativeName}</p>
    </div>
  );

  if (layout === "inline") {
    return (
      <div className="space-y-2">
        {nameBlock}
        {isClubAdmin ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={selectId} className="text-xs">
                代表者を選択
              </Label>
              <select
                id={selectId}
                className="h-9 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <Button
              type="button"
              size="sm"
              className="shrink-0 sm:mb-0"
              onClick={handleSave}
              disabled={saving || isUnchanged}
            >
              {saving ? "更新中..." : "更新"}
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">代表者の変更はクラブ管理者のみです。</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">代表者</p>
        <p className="text-xs text-muted-foreground">現在: {displayRepresentativeName}</p>
      </div>

      {isClubAdmin ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor={`${selectId}-card`}>代表者を選択</Label>
            <select
              id={`${selectId}-card`}
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
