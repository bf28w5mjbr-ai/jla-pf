import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shield, ShieldAlert } from "lucide-react";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isPfAdminRole } from "@/lib/governancePolicy";
import AdminUserSecurityLookup from "@/components/admin/AdminUserSecurityLookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "ログイン・セキュリティ照会 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function AdminUserSecurityPage() {
  const jar = await cookies();
  const token = jar.get("session")?.value ?? null;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true },
  });
  if (!isPfAdminRole(me?.role)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-16">
        <Card className="w-full border-border/90 text-center">
          <CardContent className="space-y-4 pt-10 pb-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ShieldAlert className="h-7 w-7 text-muted-foreground" aria-hidden />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">アクセスできません</p>
              <p className="mt-2 text-sm text-muted-foreground">
                ログイン・セキュリティ照会は PF 管理者のみ利用できます。
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/dashboard">ダッシュボードへ戻る</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-2 border-b border-border/80 pb-8">
        <div className="flex items-center gap-2 text-primary">
          <Shield className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">PF 管理</span>
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          ログイン・セキュリティ照会
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          ユーザー ID またはメールで検索し、User-Agent・IP の記録、パスキー登録状況、ログイン監査ログを参照します。取り扱いには十分注意してください。
        </p>
      </header>

      <AdminUserSecurityLookup />
    </div>
  );
}
