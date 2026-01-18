import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import PageLayout from '@/components/ui/PageLayout';
import CreateClubForm from '@/components/CreateClubForm';

export const metadata: Metadata = {
  title: 'クラブ作成 | JLA PF',
};

export const dynamic = "force-dynamic";

export default async function CreateClubPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  return (
    <PageLayout title="クラブを作成" description="新しいクラブを登録します">
      <CreateClubForm />
    </PageLayout>
  );
}
