import { Metadata } from 'next';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import JoinClubForm from '@/components/JoinClubForm';

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "クラブ参加 | Bluvium",
  };
}

export default async function JoinClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const club = await prisma.club.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      officePrefecture: true,
      officeCity: true,
      officeAddressLine1: true,
      officeAddressLine2: true,
      status: true,
    }
  });

  if (!club) {
    redirect(appRoutes.clubs.list());
  }

  const existingMembership = await prisma.membership.findUnique({
    where: {
      userId_clubId: {
        userId: sess.userId,
        clubId: id,
      },
    },
    select: { status: true },
  });

  if (existingMembership?.status === "APPROVED") {
    redirect(appRoutes.clubs.list());
  }

  return (
    
      <JoinClubForm club={{
        id: club.id,
        name: club.name,
        status: club.status,
        officeAddress: [
          club.officePrefecture,
          club.officeCity,
          club.officeAddressLine1,
          club.officeAddressLine2,
        ].filter(Boolean).join(" ") || null,
      }} />
    
  );
}
