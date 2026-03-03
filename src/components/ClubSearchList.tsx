"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Club {
  id: string;
  name: string;
  nameKana: string | null;
  patrolLocation: string | null;
  status: string;
  logoUrl: string | null;
  _count: {
    memberships: number;
  };
}

interface ClubSearchListProps {
  userId: string;
  excludeClubIds: string[];
}

export default function ClubSearchList({ userId, excludeClubIds }: ClubSearchListProps) {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyingClubId, setApplyingClubId] = useState<string | null>(null);

  useEffect(() => {
    fetchClubs();
  }, []);

  const fetchClubs = async () => {
    try {
      const res = await fetch("/api/clubs/search");
      if (!res.ok) throw new Error("クラブの取得に失敗しました");
      const data = await res.json();
      setClubs(data.clubs || []);
    } catch (error) {
      console.error("Fetch clubs error:", error);
      toast.error("クラブの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (clubId: string, clubName: string) => {
    if (applyingClubId) return;

    if (!confirm(`${clubName}に参加申請を送信しますか？`)) return;

    setApplyingClubId(clubId);

    try {
      const res = await fetch("/api/clubs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "申請に失敗しました");
      }

      toast.success("参加申請を送信しました");
      
      // リストから削除（申請済みなので表示しない）
      setClubs(clubs.filter(c => c.id !== clubId));
      setSelectedClubId(null);
      setSearchQuery("");
      router.refresh();
    } catch (error: any) {
      console.error("Apply error:", error);
      toast.error(error.message || "申請に失敗しました");
    } finally {
      setApplyingClubId(null);
    }
  };

  const filteredClubs = clubs.filter(club => {
    // 既に申請中または所属しているクラブを除外
    if (excludeClubIds.includes(club.id)) return false;
    
    // APPROVED または JLA_APPROVED のクラブのみ表示
    if (club.status !== 'APPROVED' && club.status !== 'JLA_APPROVED') return false;

    // 検索クエリでフィルタ
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      club.name.toLowerCase().includes(query) ||
      club.nameKana?.toLowerCase().includes(query) ||
      club.patrolLocation?.toLowerCase().includes(query)
    );
  });

  const selectedClub = selectedClubId
    ? clubs.find((club) => club.id === selectedClubId) ?? null
    : null;

  const suggestions = searchQuery
    ? filteredClubs.filter((club) =>
        club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.nameKana?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        club.patrolLocation?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Input
                type="text"
                placeholder="クラブ名を入力して検索..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedClubId(null);
                }}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
                  <ul className="max-h-64 overflow-y-auto py-2">
                    {suggestions.slice(0, 8).map((club) => (
                      <li key={club.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClubId(club.id);
                            setSearchQuery(club.name);
                          }}
                          className="flex w-full flex-col gap-1 px-4 py-2 text-left transition hover:bg-gray-50"
                        >
                          <span className="text-sm font-semibold text-gray-900">{club.name}</span>
                          <span className="text-xs text-gray-500">
                            {club.patrolLocation ?? "監視場所未登録"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <Button
              onClick={() =>
                selectedClub && handleApply(selectedClub.id, selectedClub.name)
              }
              disabled={!selectedClub || applyingClubId === selectedClub.id}
              className="shrink-0"
            >
              {selectedClub && applyingClubId === selectedClub.id ? "申請中..." : "申請"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            候補から選択すると正式名で固定され、申請ボタンが有効になります。
          </p>
        </CardContent>
      </Card>

      {searchQuery && suggestions.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          該当するクラブが見つかりませんでした。
        </div>
      )}
    </div>
  );
}
