import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import CreateAssociationForm from "@/components/CreateAssociationForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "協会作成 | Bluvium",
  description: "新しい協会アカウントを作成します",
};

export default async function CreateAssociationPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });

  if (!user || user.role !== "PF_ADMIN") {
    redirect("/admin/account");
  }

  return <CreateAssociationForm />;
}
