import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { getOrgAdminContextForCompetition } from "@/lib/dayOpsAccess";
import { verifyDayOpsUnlockFromCookies } from "@/lib/dayOpsUnlockCookie";
import { EventDsqManagementClient } from "@/components/EventDsqManagementClient";
import { buildResultRoundLabelMap } from "@/lib/resultRoundLabels";

export const dynamic = "force-dynamic";

const ROUNDS = ["HEAT", "SEMI", "FINAL"] as const;
type RoundKey = (typeof ROUNDS)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}): Promise<Metadata> {
  const { id, eventId } = await params;
  const event = await prisma.event.findFirst({
    where: { id: eventId, competitionId: id },
    select: { name: true },
  });
  return {
    title: event?.name ? `失格管理 | ${event.name} | Bluvium` : "失格管理 | Bluvium",
  };
}

export default async function EventDsqManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id: competitionId, eventId } = await params;
  const sp = await searchParams;
  const roundRaw = (sp.round ?? "HEAT").toUpperCase();
  const initialRound: RoundKey = ROUNDS.includes(roundRaw as RoundKey)
    ? (roundRaw as RoundKey)
    : "HEAT";

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  const [event, access, hasDayOpsUnlock] = await Promise.all([
    prisma.event.findFirst({
      where: { id: eventId, competitionId },
      select: {
        id: true,
        name: true,
        startListRoundCount: true,
        competition: {
          select: { name: true, status: true, startListSettings: true },
        },
      },
    }),
    session?.userId
      ? getOrgAdminContextForCompetition(competitionId, session.userId)
      : Promise.resolve({ organizationId: "", isOrgAdmin: false }),
    verifyDayOpsUnlockFromCookies(competitionId),
  ]);

  if (!session?.userId && !hasDayOpsUnlock) {
    redirect("/login");
  }

  if (!event) {
    notFound();
  }

  if (!access.isOrgAdmin && !hasDayOpsUnlock) {
    redirect(`/competitions/${competitionId}/start-list/${eventId}`);
  }

  const roundLabels = buildResultRoundLabelMap(
    event.competition.startListSettings,
    eventId,
    event.startListRoundCount
  );

  return (
    <EventDsqManagementClient
      competitionId={competitionId}
      eventId={eventId}
      eventName={event.name}
      initialRound={initialRound}
      roundLabels={roundLabels}
    />
  );
}
