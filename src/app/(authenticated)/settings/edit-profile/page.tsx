import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import EditProfileForm from "@/components/EditProfileForm";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "個人情報編集 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      familyName: true,
      givenName: true,
      familyNameKana: true,
      givenNameKana: true,
      dateOfBirth: true,
      sex: true,
      postalCode: true,
      prefecture: true,
      city: true,
      addressLine1: true,
      addressLine2: true,
      emergencyContactFamilyName: true,
      emergencyContactGivenName: true,
      emergencyContactPhone: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-4 border-b border-border/80 pb-8">
        <Button variant="ghost" size="sm" className="-ml-2 h-9 gap-1.5 px-2 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            設定に戻る
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <UserRound className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              <span className="text-sm font-medium">プロフィール</span>
            </div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              個人情報の編集
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              大会エントリーや所属審査に表示される氏名・住所などを更新できます。必須項目は
              <span className="text-foreground">*</span> です。
            </p>
          </div>
        </div>
      </header>

      <EditProfileForm user={user} />
    </div>
  );
}
