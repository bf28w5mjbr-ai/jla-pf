import { redirect } from "next/navigation";

import { getRequiredAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isOrgAdminRole } from "@/lib/roleScopes";
import {
  buildHostOrganizationSnapshot,
  createDraftCompetition,
  defaultDraftCompetitionFields,
} from "@/lib/createDraftCompetition";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CreateCompetitionPage({ params }: PageProps) {
  const { id: organizationId } = await params;

  const userId = await getRequiredAuthenticatedUserId();

  const orgAdmin = await prisma.orgAdmin.findFirst({
    where: {
      userId: userId,
      organizationId,
    },
    include: {
      organization: {
        select: {
          name: true,
          nameKana: true,
          abbreviation: true,
          status: true,
        },
      },
    },
  });

  if (!orgAdmin || !isOrgAdminRole(orgAdmin.role)) {
    redirect(`/organizations/${organizationId}`);
  }

  if (orgAdmin.organization.status !== "APPROVED") {
    redirect(`/organizations/${organizationId}`);
  }

  const { name, startDate, endDate } = defaultDraftCompetitionFields();

  const competition = await createDraftCompetition({
    organizationId,
    snapshot: buildHostOrganizationSnapshot(orgAdmin.organization),
    name,
    startDate,
    endDate,
  });

  redirect(`/organizations/${organizationId}/competitions/${competition.id}`);
}
