// src/app/api/memberships/[id]/route.ts
export const runtime = "nodejs";

import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { z } from "zod";
import { isClubAdminRole, normalizeClubRoleForWrite } from "@/lib/roleScopes";
import { zodErrorJsonBody } from "@/lib/zodApiResponse";
import { isPfAdminRole } from "@/lib/governancePolicy";
import { shouldClearPrimaryClubAfterMembershipDelete } from "@/lib/membershipPrimaryClub";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveMembershipMutationPermission(
  sessUserId: string,
  clubId: string,
  deleteEndpoint: boolean
): Promise<
  | { ok: true; pfBypass: boolean }
  | { ok: false; response: NextResponse }
> {
  const actor = await prisma.user.findUnique({
    where: { id: sessUserId },
    select: { role: true },
  });
  if (isPfAdminRole(actor?.role)) {
    return { ok: true, pfBypass: true };
  }

  const adminMembership = await prisma.membership.findFirst({
    where: {
      userId: sessUserId,
      clubId,
      status: "APPROVED",
    },
  });

  if (!adminMembership || !isClubAdminRole(adminMembership.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: deleteEndpoint
            ? "クラブ管理者のみがメンバーを削除できます"
            : "クラブの管理者権限がありません",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true, pfBypass: false };
}

function membershipAuditExtra(
  pfBypass: boolean,
  clubId: string,
  targetUserId: string
): Record<string, unknown> {
  if (!pfBypass) return {};
  return {
    pfAdminBypass: true,
    clubId,
    targetUserId,
  };
}

// GET /api/memberships/[id] - メンバーシップ詳細取得
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const membership = await prisma.membership.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
            phoneNumber: true,
          },
        },
        club: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            officePrefecture: true,
            officeCity: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'メンバーシップが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(membership);
  } catch (err) {
    return jsonInternalError500("GET api/memberships/[id]/route.ts", err);
  }
}

// PATCH /api/memberships/[id] - メンバーシップ更新（承認・却下・ロール変更）
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const membership = await prisma.membership.findUnique({
      where: { id },
      select: {
        id: true,
        clubId: true,
        userId: true,
        status: true,
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'メンバーシップが見つかりません' },
        { status: 404 }
      );
    }

    const perm = await resolveMembershipMutationPermission(
      sess.userId,
      membership.clubId,
      false
    );
    if (!perm.ok) return perm.response;

    const body = await req.json().catch(() => ({}));

    const UpdateMembershipSchema = z.object({
      status: z.enum(['APPROVED', 'REJECTED']).optional(),
      role: z.enum(['ADMIN', 'MEMBER']).optional(),
    });

    const data = UpdateMembershipSchema.parse(body);

    // ステータスまたはロールを更新
    const updated = await prisma.membership.update({
      where: { id },
      data: {
        status: data.status,
        role: data.role ? normalizeClubRoleForWrite(data.role) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
        club: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const auditMeta = {
      ...data,
      ...membershipAuditExtra(
        perm.pfBypass,
        membership.clubId,
        membership.userId
      ),
    };

    // AuditLog 記録
    await prisma.auditLog.create({
      data: {
        actorUserId: sess.userId,
        action: data.status === 'APPROVED' ? 'MEMBERSHIP_APPROVE' : 
                data.status === 'REJECTED' ? 'MEMBERSHIP_REJECT' : 
                'MEMBERSHIP_UPDATE',
        target: `membership:${id}`,
        meta: auditMeta,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorJsonBody(err, "validation_message_ja"), { status: 400 });
    }

    return jsonInternalError500("PATCH api/memberships/[id]/route.ts", err);
  }
}

// DELETE /api/memberships/[id] - メンバーシップ削除（退会）
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value ?? null;
    const sess = token ? await verifySession(token) : null;

    if (!sess?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const membership = await prisma.membership.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        clubId: true,
        role: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'メンバーシップが見つかりません' },
        { status: 404 }
      );
    }

    const perm = await resolveMembershipMutationPermission(
      sess.userId,
      membership.clubId,
      true
    );
    if (!perm.ok) return perm.response;

    await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: membership.userId },
        select: { primaryClubId: true },
      });

      await tx.membership.delete({
        where: { id },
      });

      if (
        shouldClearPrimaryClubAfterMembershipDelete(
          targetUser?.primaryClubId,
          membership.clubId
        )
      ) {
        await tx.user.update({
          where: { id: membership.userId },
          data: { primaryClubId: null },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: sess.userId,
          action: "MEMBERSHIP_DELETE",
          target: `membership:${id}`,
          meta: {
            deleted: true,
            ...membershipAuditExtra(
              perm.pfBypass,
              membership.clubId,
              membership.userId
            ),
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonInternalError500("DELETE api/memberships/[id]/route.ts", err);
  }
}
