import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonInternalError500 } from "@/lib/apiInternalError";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    const invitation = await prisma.organizationAdminInvitation.findUnique({
      where: { token },
      include: {
        organization: { select: { id: true, name: true, status: true } },
        invitedBy: {
          select: {
            profile: { select: { familyName: true, givenName: true } },
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "招待が見つかりません" }, { status: 404 });
    }

    const expired =
      invitation.status === "PENDING" && invitation.expiresAt < new Date();

    return NextResponse.json({
      invitation: {
        status: expired ? "EXPIRED" : invitation.status,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        organization: invitation.organization,
        inviterName: [
          invitation.invitedBy.profile?.familyName,
          invitation.invitedBy.profile?.givenName,
        ]
          .filter(Boolean)
          .join(" "),
      },
    });
  } catch (error) {
    return jsonInternalError500("GET org-admin-invitation", error);
  }
}
