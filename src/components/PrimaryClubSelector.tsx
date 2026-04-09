"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { toast } from "sonner";

type ClubOption = {
  clubId: string;
  clubName: string;
};

type PrimaryClubSelectorProps = {
  primaryClubId: string | null;
  clubs: ClubOption[];
};

export default function PrimaryClubSelector({ primaryClubId, clubs }: PrimaryClubSelectorProps) {
  const [selectedClubId, setSelectedClubId] = useState(primaryClubId || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedClubId) {
      toast.error("メイン所属クラブを選択してください");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/users/me/primary-club", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: selectedClubId }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "更新に失敗しました");
        return;
      }

      toast.success("メイン所属クラブを更新しました");
    } catch (error) {
      console.error("Primary club update error:", error);
      toast.error("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (clubs.length === 0) {
    return <p className="text-sm text-muted-foreground">承認済みの所属クラブがありません。</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="primaryClub">メイン所属クラブ</Label>
        <select
          id="primaryClub"
          className="border rounded px-3 py-2 w-full max-w-sm bg-white dark:bg-gray-900"
          value={selectedClubId}
          onChange={(e) => setSelectedClubId(e.target.value)}
        >
          <option value="">クラブを選択してください</option>
          {clubs.map((club) => (
            <option key={club.clubId} value={club.clubId}>
              {club.clubName}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "更新中..." : "保存"}
      </Button>
    </div>
  );
}
