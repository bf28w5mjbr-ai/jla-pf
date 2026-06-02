import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { AuthenticatedLayoutFallback } from "@/app/(authenticated)/_components/AuthenticatedLayoutFallback";
import { AuthenticatedLayoutShell } from "@/app/(authenticated)/_components/AuthenticatedLayoutShell";
import { PublicSiteShellWrapper } from "@/components/public/PublicSiteShellWrapper";

/**
 * 未ログインでも閲覧可能だが、ログイン済みは会員シェルに寄せたいルート用。
 * 例: 種目スタートリスト（URL は `/competitions/[id]/start-list/...` のまま）。
 */
export default async function AdaptiveShellLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (session?.userId) {
    return (
      <Suspense fallback={<AuthenticatedLayoutFallback>{children}</AuthenticatedLayoutFallback>}>
        <AuthenticatedLayoutShell userId={session.userId}>{children}</AuthenticatedLayoutShell>
      </Suspense>
    );
  }

  return <PublicSiteShellWrapper>{children}</PublicSiteShellWrapper>;
}
