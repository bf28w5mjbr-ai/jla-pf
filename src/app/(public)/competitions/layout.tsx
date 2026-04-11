import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import PublicCompetitionsChrome from "@/components/public/PublicCompetitionsChrome";

export default async function PublicCompetitionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  return (
    <>
      <PublicCompetitionsChrome isLoggedIn={Boolean(session?.userId)} />
      {children}
    </>
  );
}
