import { Metadata } from "next";

import { redirect } from "next/navigation";
import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import CreateAssociationForm from "@/components/CreateAssociationForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "協会作成 | Bluvium",
  description: "新しい協会アカウントを作成します",
};

export default async function CreateAssociationPage() {
  const userId = await getRequiredAuthenticatedUserId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== "PF_ADMIN") {
    redirect("/admin/account");
  }

  return <CreateAssociationForm />;
}
