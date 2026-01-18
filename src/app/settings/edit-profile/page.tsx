import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import EditProfileForm from '@/components/EditProfileForm';

export const metadata: Metadata = {
  title: '個人情報編集 | JLA PF',
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
      emergencyContactName: true,
      emergencyContactPhone: true,
    }
  });

  if (!user) redirect("/login");

  return (
    <PageLayout title="個人情報編集" description="基本情報と住所を編集">
      <EditProfileForm user={user} />
    </PageLayout>
  );
}
