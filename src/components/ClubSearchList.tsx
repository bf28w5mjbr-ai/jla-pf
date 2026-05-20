"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Users, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { appRoutes } from "@/lib/appRoutes";
import { publicUploadDisplaySrc } from "@/lib/publicUploadSupabaseInfer";

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
  excludeClubIds: string[];
}

const BROWSE_WHEN_EMPTY = 48;
const MATCH_CAP = 120;

function ClubLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = publicUploadDisplaySrc(logoUrl);
  const chars = [...name.trim()];
  const initialsLabel = chars.length >= 2 ? `${chars[0]}${chars[1]}` : (chars[0] ?? "?");

  if (!src || broken) {
    return (
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/40 text-xs font-semibold text-muted-foreground"
        aria-hidden
      >
        {initialsLabel}
      </div>
    );
  }
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- 任意オリジンのクラブロゴ */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain p-1"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 max-w-full animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-28 max-w-full animate-pulse rounded-md bg-muted/80" />
            <div className="h-3 w-full max-w-[14rem] animate-pulse rounded-md bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ClubSearchList({ excludeClubIds }: ClubSearchListProps) {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [applyingClubId, setApplyingClubId] = useState<string | null>(null);

  useEffect(() => {
    void fetchClubs();
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

    if (!confirm(`${clubName}に参加を申請しますか？`)) return;

    setApplyingClubId(clubId);

    try {
      const res = await fetch(`/api/clubs/${clubId}/join`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "申請に失敗しました");
      }

      toast.success("参加申請を送信しました", {
        action: {
          label: "ダッシュボードへ",
          onClick: () => {
            router.push(appRoutes.dashboard());
            router.refresh();
          },
        },
      });

      setClubs((prev) => prev.filter((c) => c.id !== clubId));
      router.refresh();
    } catch (error: unknown) {
      console.error("Apply error:", error);
      const message = error instanceof Error ? error.message : "申請に失敗しました";
      toast.error(message);
    } finally {
      setApplyingClubId(null);
    }
  };

  const filteredClubs = useMemo(() => {
    return clubs.filter((club) => {
      if (excludeClubIds.includes(club.id)) return false;
      if (club.status !== "APPROVED") return false;

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      return (
        club.name.toLowerCase().includes(q) ||
        club.nameKana?.toLowerCase().includes(q) ||
        club.patrolLocation?.toLowerCase().includes(q)
      );
    });
  }, [clubs, excludeClubIds, searchQuery]);

  const displayClubs = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) {
      return filteredClubs.slice(0, BROWSE_WHEN_EMPTY);
    }
    return filteredClubs.slice(0, MATCH_CAP);
  }, [filteredClubs, searchQuery]);

  const hiddenByLimit =
    searchQuery.trim().length === 0
      ? Math.max(0, filteredClubs.length - BROWSE_WHEN_EMPTY)
      : Math.max(0, filteredClubs.length - MATCH_CAP);

  if (loading) {
    return (
      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/20">
          <CardTitle className="text-base">読み込み中</CardTitle>
          <CardDescription>公開クラブ一覧を取得しています</CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-4 sm:px-5">
          <CardTitle className="text-base font-semibold">検索</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            クラブ名・よみがな・主な監視場所で絞り込みできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden
            />
            <Input
              type="search"
              enterKeyHint="search"
              placeholder="例: 湘南、しょうなん、監視場所…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 rounded-xl border-border/80 pl-10 pr-10 text-sm shadow-sm"
              aria-label="クラブを検索"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                aria-label="検索をクリア"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {filteredClubs.length === 0
              ? "表示できるクラブがありません。"
              : `参加申請できるクラブ ${filteredClubs.length} 件`}
            {excludeClubIds.length > 0 ? (
              <span className="text-muted-foreground/80">
                {" "}
                （既に申請中・所属のクラブは除いています）
              </span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {hiddenByLimit > 0 ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {searchQuery.trim()
            ? `検索結果が多いため、先頭 ${MATCH_CAP} 件のみ表示しています。検索語を増やすと絞り込めます。`
            : `一覧は先頭 ${BROWSE_WHEN_EMPTY} 件です。検索すると目的のクラブをすぐに見つけられます。`}
        </div>
      ) : null}

      {filteredClubs.length === 0 ? (
        <Card className="border-dashed border-border/90 bg-muted/20 shadow-none">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.25} aria-hidden />
            <p className="text-sm font-medium text-foreground">該当するクラブがありません</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              検索条件を変えるか、すでに全クラブへ申請済み・所属済みの可能性があります。
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2" role="list">
          {displayClubs.map((club) => (
            <li key={club.id} role="listitem">
              <Card
                padding="none"
                className="h-full overflow-hidden border-border/85 shadow-sm transition hover:border-primary/25 hover:shadow-md"
              >
                <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
                  <div className="flex gap-3">
                    <ClubLogo name={club.name} logoUrl={club.logoUrl} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="text-sm font-semibold leading-snug text-foreground sm:text-base">
                        {club.name}
                      </h2>
                      {club.nameKana ? (
                        <p className="text-xs text-muted-foreground">{club.nameKana}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <MapPin
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>{club.patrolLocation?.trim() || "監視場所未登録"}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0 text-primary/70" strokeWidth={1.75} aria-hidden />
                      <span>承認済みメンバー {club._count.memberships} 名</span>
                    </p>
                  </div>
                  <div className="mt-auto border-t border-border/60 pt-3">
                    <Button
                      type="button"
                      className="w-full gap-1.5 shadow-sm"
                      disabled={applyingClubId === club.id}
                      onClick={() => void handleApply(club.id, club.name)}
                    >
                      {applyingClubId === club.id ? "送信中…" : "このクラブに参加申請"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
