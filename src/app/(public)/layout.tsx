import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 未ログインでも閲覧できる大会ページ用。サイドバーなし・上部にログイン導線のみ。
 */
export default function PublicShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/login">ログイン</Link>
          </Button>
        </div>
      </header>
      <main className="app-main-canvas min-h-0 min-w-0 flex-1 pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] pt-[var(--safe-area-top)]">
        {children}
      </main>
    </div>
  );
}
