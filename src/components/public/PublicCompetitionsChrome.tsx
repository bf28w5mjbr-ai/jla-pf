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
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-2">
        {isLoggedIn ? (
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/dashboard">ダッシュボード</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href={signInHref}>サインイン</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
