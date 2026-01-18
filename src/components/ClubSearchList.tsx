"use client";

import { useState, useEffect } from "react";
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
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
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
    
    // ACTIVE または JLA_APPROVED のクラブのみ表示
    if (club.status !== 'ACTIVE' && club.status !== 'JLA_APPROVED') return false;

    // 検索クエリでフィルタ
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      club.name.toLowerCase().includes(query) ||
      club.nameKana?.toLowerCase().includes(query) ||
      club.patrolLocation?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 検索バー */}
      <Card>
        <CardContent className="pt-6">
          <Input
            type="text"
            placeholder="クラブ名、監視場所で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {/* クラブリスト */}
      {filteredClubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? "該当するクラブが見つかりませんでした" : "参加可能なクラブがありません"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClubs.map((club) => (
            <Card key={club.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start gap-4">
                  {club.logoUrl ? (
                    <div className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0">
                      <img src={club.logoUrl} alt={`${club.name}のロゴ`} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg leading-tight mb-1">{club.name}</CardTitle>
                    {club.nameKana && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{club.nameKana}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {club.patrolLocation && (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">監視場所:</span>{" "}
                    <span className="text-gray-900 dark:text-gray-100">{club.patrolLocation}</span>
                  </div>
                )}
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">メンバー数:</span>{" "}
                  <span className="text-gray-900 dark:text-gray-100">{club._count.memberships}名</span>
                </div>
                <div className="pt-2">
                  <Button
                    onClick={() => handleApply(club.id, club.name)}
                    disabled={applyingClubId === club.id}
                    className="w-full"
                  >
                    {applyingClubId === club.id ? "申請中..." : "参加申請"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
