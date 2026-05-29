import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { AuthenticatedLayoutFallback } from "./_components/AuthenticatedLayoutFallback";
import { AuthenticatedLayoutShell } from "./_components/AuthenticatedLayoutShell";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<AuthenticatedLayoutFallback>{children}</AuthenticatedLayoutFallback>}>
      <AuthenticatedLayoutShell userId={session.userId}>{children}</AuthenticatedLayoutShell>
    </Suspense>
  );
}
