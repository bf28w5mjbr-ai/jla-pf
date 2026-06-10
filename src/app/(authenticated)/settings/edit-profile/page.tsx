import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { SettingsEditorialSection } from "@/app/(authenticated)/settings/_components/SettingsEditorialSection";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import EditProfileForm from "@/components/EditProfileForm";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "個人情報編集 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      profile: true,
      address: true,
      emergencyContact: true,
    },
  });

  if (!user?.profile || !user.address) redirect("/login");

  const formUser = {
    id: user.id,
    familyName: user.profile.familyName,
    givenName: user.profile.givenName,
    familyNameKana: user.profile.familyNameKana,
    givenNameKana: user.profile.givenNameKana,
    dateOfBirth: user.profile.dateOfBirth,
    sex: user.profile.sex,
    postalCode: user.address.postalCode,
    prefecture: user.address.prefecture,
    city: user.address.city,
    addressLine1: user.address.addressLine1,
    addressLine2: user.address.addressLine2,
    emergencyContactFamilyName: user.emergencyContact?.familyName ?? null,
    emergencyContactGivenName: user.emergencyContact?.givenName ?? null,
    emergencyContactPhone: user.emergencyContact?.phoneNumber ?? null,
  };

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">個人情報の編集</h1>

      <section
        className={cn(
          dashboardSectionClassName,
          "border-b border-border/40 pb-0 pt-10 sm:pt-12"
        )}
      >
        <Link
          href="/settings"
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-1.5 text-sm text-muted-foreground",
            "transition-colors hover:border-border/60 hover:bg-muted/30 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          <ArrowLeft
            className="size-4 transition-transform group-hover:-translate-x-0.5"
            aria-hidden
          />
          設定に戻る
        </Link>
      </section>

      <SettingsEditorialSection
        label="Profile"
        title="個人情報の編集"
        description="大会エントリーや所属審査に表示される氏名・住所などを更新できます。必須項目は * です。"
        contentClassName="space-y-5"
        className="border-t-0 pt-8 sm:pt-10"
      >
        <EditProfileForm user={formUser} />
      </SettingsEditorialSection>
    </div>
  );
}
