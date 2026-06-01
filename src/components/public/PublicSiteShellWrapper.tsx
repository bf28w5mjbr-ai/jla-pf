import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { PublicSiteShell } from "@/components/public/PublicSiteShell";

export type PublicSiteShellVariant = "standard" | "cover";

type Props = {
  children: ReactNode;
  /** `cover`: トップ用（常時ドロワーのみ）。`standard`: 公開一覧など */
  variant?: PublicSiteShellVariant;
};

/** サーバーでセッションを解決し、公開サイト共通シェルで包む */
export async function PublicSiteShellWrapper({
  children,
  variant = "standard",
}: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  return (
    <PublicSiteShell isLoggedIn={Boolean(session?.userId)} variant={variant}>
      {children}
    </PublicSiteShell>
  );
}
