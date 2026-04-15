"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  isLoggedIn: boolean;
};

/**
 * 未ログイン閲覧用の大会公開ルート専用ヘッダー。
 * 認証済みの大会一覧（/competitions・サイドバー経由）では表示されない。
 */
export default function PublicCompetitionsChrome({ isLoggedIn }: Props) {
  const pathname = usePathname() || "/";
  const signInHref = `/login?redirect=${encodeURIComponent(pathname)}`;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            Bluvium
          </Link>
          <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">大会情報（公開）</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLoggedIn ? (
            <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
              <Link href="/dashboard">ダッシュボード</Link>
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs shadow-sm" asChild>
              <Link href={signInHref}>ログイン</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
