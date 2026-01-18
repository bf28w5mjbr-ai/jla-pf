import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import CreateCompetitionForm from "@/components/CreateCompetitionForm";

type PageProps = {
  searchParams: Promise<{ organizationId?: string }>;
};

export default async function CreateCompetitionPage({ searchParams }: PageProps) {
  const { organizationId } = await searchParams;

  // セッション確認
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session?.userId) {
    redirect("/login");
  }

  if (!organizationId) {
    redirect("/organizations");
  }

  // 団体への権限を確認（OWNER または ADMIN）
  const orgAdmin = await prisma.orgAdmin.findFirst({
    where: {
      userId: session.userId,
      organizationId,
      role: {
        in: ["OWNER", "ADMIN"],
      },
    },
    include: {
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!orgAdmin) {
    redirect(`/organizations/${organizationId}`);
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">大会を作成</h1>
        <p className="text-muted-foreground mt-2">{orgAdmin.organization.name}</p>
      </div>

      <CreateCompetitionForm organizationId={organizationId} />
    </div>
  );
}
