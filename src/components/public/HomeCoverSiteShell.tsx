import type { ReactNode } from "react";
import { PublicSiteShell } from "@/components/public/PublicSiteShell";

type Props = {
  children: ReactNode;
};

/**
 * トップ（カバー）用シェル。Edge でログイン済み `/` は dashboard へ rewrite されるため、
 * ここに到達するのは未ログインのみ。cookies() を避け ISR を可能にする。
 */
export function HomeCoverSiteShell({ children }: Props) {
  return (
    <PublicSiteShell isLoggedIn={false} variant="cover">
      {children}
    </PublicSiteShell>
  );
}
