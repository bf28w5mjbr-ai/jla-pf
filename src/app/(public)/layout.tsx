import type { ReactNode } from "react";
import { PublicSiteShellWrapper } from "@/components/public/PublicSiteShellWrapper";

/**
 * 未ログインでも閲覧できるルート用（大会・クラブ・法定表示など）。
 * 共通ヘッダー・サイドバーで Bluvium 公開サイトとして表示する。
 */
export default function PublicShellLayout({ children }: { children: ReactNode }) {
  return <PublicSiteShellWrapper>{children}</PublicSiteShellWrapper>;
}
