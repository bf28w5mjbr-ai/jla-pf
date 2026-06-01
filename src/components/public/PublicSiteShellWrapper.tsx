import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { PublicSiteShell } from "@/components/public/PublicSiteShell";

type Props = {
  children: ReactNode;
};

/** サーバーでセッションを解決し、公開サイト共通シェルで包む */
export async function PublicSiteShellWrapper({ children }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  return <PublicSiteShell isLoggedIn={Boolean(session?.userId)}>{children}</PublicSiteShell>;
}
