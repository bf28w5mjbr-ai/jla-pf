import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/server/db";
import { verifySession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });

    if (!user || user.role !== "PF_ADMIN") {
      return NextResponse.json({ error: "PF管理者権限が必要です" }, { status: 403 });
    }

    const body = await request.json();
    const name =
      typeof body?.name === "string" ? body.name.trim() : "";
    const abbreviation =
      typeof body?.abbreviation === "string" ? body.abbreviation.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "協会名は必須です" }, { status: 400 });
    }

    const duplicateConditions: Prisma.AssociationWhereInput[] = [
      { name: { equals: name, mode: "insensitive" as const } },
    ];

    if (abbreviation) {
      duplicateConditions.push({
        abbreviation: { equals: abbreviation, mode: "insensitive" as const },
      });
    }

    const existingAssociation = await prisma.association.findFirst({
      where: {
        OR: duplicateConditions,
      },
    });

    if (existingAssociation) {
      return NextResponse.json(
        { error: "同名または同じ略称の協会が既に存在します" },
        { status: 409 }
      );
    }

    const association = await prisma.$transaction(async (tx) => {
      const createdAssociation = await tx.association.create({
        data: {
          name,
          abbreviation: abbreviation || null,
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "ASSOCIATION_CREATE",
          target: createdAssociation.id,
          meta: {
            status: createdAssociation.status,
            abbreviation: createdAssociation.abbreviation,
          },
        },
      });

      return createdAssociation;
    });

    return NextResponse.json({
      id: association.id,
      name: association.name,
      abbreviation: association.abbreviation,
      status: association.status,
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "同名または同じ略称の協会が既に存在します" },
        { status: 409 }
      );
    }

    return jsonInternalError500("POST api/associations/create/route.ts", error);
  }
}
