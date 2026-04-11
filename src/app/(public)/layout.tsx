/**
 * 未ログインでも閲覧できるルート用。サイドバーなし。
 * 大会の公開URL（/competitions/...）では子レイアウトでサインイン導線を出す。
 */
export default function PublicShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="app-main-canvas min-h-0 min-w-0 flex-1 pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] pt-[var(--safe-area-top)]">
        {children}
      </main>
    </div>
  );
}
