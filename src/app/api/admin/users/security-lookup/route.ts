// GET /api/admin/users/security-lookup?q= | &userId=  PF 管理者のみ。ログイン環境・パスキー・監査・プロフィール参照用。
// 秘密（passwordHash / emailVerifyToken / パスキー生バイト / 口座番号の生値）は返さない。
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import { isPfAdminRole } from "@/lib/governancePolicy";
import { maskPhoneNumber } from "@/lib/phone";
import {
  buildNameContainsWhere,
  looksLikeEmailQuery,
  looksLikeUserIdQuery,
  maskBankAccountNumber,
  sliceNameSearchCandidates,
} from "@/lib/adminSecurityLookup";

const NAME_SEARCH_TAKE = 21;

function iso(d: Date | null | undefined): string | null {
  return d?.toISOString() ?? null;
}

async function buildDetailJson(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      primaryClubId: true,
      preferredLanguage: true,
      mfaEnabled: true,
      mfaEnforced: true,
      nfcTagId: true,
      deletedAt: true,
      deletionScheduledAt: true,
      familyName: true,
      givenName: true,
      familyNameKana: true,
      givenNameKana: true,
      normalizedFamilyName: true,
      normalizedGivenName: true,
      dateOfBirth: true,
      sex: true,
      phoneNumber: true,
      phoneVerified: true,
      phoneVerifiedAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      lastLoginUa: true,
      profilePhotoUrl: true,
      postalCode: true,
      prefecture: true,
      city: true,
      addressLine1: true,
      addressLine2: true,
      emergencyContactFamilyName: true,
      emergencyContactGivenName: true,
      emergencyContactFamilyNameKana: true,
      emergencyContactGivenNameKana: true,
      emergencyContactPhone: true,
      jlaMemberNumber: true,
      legacyJlaMemberNumber: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { passkeyCredentials: true } },
      memberships: {
        take: 50,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          club: {
            select: { id: true, name: true, status: true },
          },
        },
      },
      qualifications: {
        take: 50,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          certNumber: true,
          issueDate: true,
          expiryDate: true,
          status: true,
          attachmentUrl: true,
          recordOrigin: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      competitionEntries: {
        take: 50,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          competitionId: true,
          clubId: true,
          status: true,
          totalFee: true,
          paymentId: true,
          createdAt: true,
          updatedAt: true,
          competition: { select: { id: true, name: true } },
          club: { select: { id: true, name: true } },
        },
      },
      passkeyCredentials: {
        select: {
          id: true,
          label: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
          transports: true,
          counter: true,
        },
      },
      orgAdminRoles: {
        select: {
          id: true,
          role: true,
          organizationId: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      },
      associationAdminRoles: {
        select: {
          id: true,
          role: true,
          associationId: true,
          createdAt: true,
          association: { select: { id: true, name: true } },
        },
      },
      primaryClub: {
        select: { id: true, name: true, status: true },
      },
      bankAccount: {
        select: {
          id: true,
          bankName: true,
          branchName: true,
          accountType: true,
          accountNumber: true,
          accountHolderName: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) return null;

  const loginAudits = await prisma.auditLog.findMany({
    where: {
      actorUserId: userId,
      action: "USER_LOGIN_SUCCESS",
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      createdAt: true,
      meta: true,
    },
  });

  const {
    memberships,
    qualifications,
    competitionEntries,
    passkeyCredentials,
    orgAdminRoles,
    associationAdminRoles,
    primaryClub,
    bankAccount,
    _count,
    ...scalarUser
  } = user;

  const profile = {
    ...scalarUser,
    sex: scalarUser.sex as string,
    dateOfBirth: iso(scalarUser.dateOfBirth),
    deletedAt: iso(scalarUser.deletedAt),
    deletionScheduledAt: iso(scalarUser.deletionScheduledAt),
    phoneVerifiedAt: iso(scalarUser.phoneVerifiedAt),
    lastLoginAt: iso(scalarUser.lastLoginAt),
    createdAt: iso(scalarUser.createdAt),
    updatedAt: iso(scalarUser.updatedAt),
    phoneMasked: maskPhoneNumber(scalarUser.phoneNumber),
  };

  const bankAccountMasked = bankAccount
    ? {
        id: bankAccount.id,
        bankName: bankAccount.bankName,
        branchName: bankAccount.branchName,
        accountType: bankAccount.accountType,
        accountNumberMasked: maskBankAccountNumber(bankAccount.accountNumber),
        accountHolderName: bankAccount.accountHolderName,
        createdAt: iso(bankAccount.createdAt),
        updatedAt: iso(bankAccount.updatedAt),
      }
    : null;

  const membershipsJson = memberships.map((m) => ({
    ...m,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
  }));

  const qualificationsJson = qualifications.map((q) => ({
    ...q,
    issueDate: iso(q.issueDate),
    expiryDate: iso(q.expiryDate),
    createdAt: iso(q.createdAt),
    updatedAt: iso(q.updatedAt),
  }));

  const competitionEntriesJson = competitionEntries.map((e) => ({
    ...e,
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
  }));

  const passkeysJson = passkeyCredentials.map((p) => ({
    ...p,
    lastUsedAt: iso(p.lastUsedAt),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  }));

  const orgAdminRolesJson = orgAdminRoles.map((o) => ({
    ...o,
    createdAt: iso(o.createdAt),
  }));

  const associationAdminRolesJson = associationAdminRoles.map((a) => ({
    ...a,
    createdAt: iso(a.createdAt),
  }));

  return {
    ambiguous: false as const,
    profile,
    relations: {
      memberships: membershipsJson,
      qualifications: qualificationsJson,
      competitionEntries: competitionEntriesJson,
      passkeys: passkeysJson,
      orgAdminRoles: orgAdminRolesJson,
      associationAdminRoles: associationAdminRolesJson,
      primaryClub,
      bankAccount: bankAccountMasked,
    },
    loginAudits: loginAudits.map((a) => ({
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      meta: a.meta,
    })),
    passkeyCount: _count.passkeyCredentials,
  };
}

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { role: true },
  });
  if (!isPfAdminRole(me?.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const userIdParam = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (userIdParam) {
    const detail = await buildDetailJson(userIdParam);
    if (!detail) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  if (q.length < 3) {
    return NextResponse.json(
      { error: "検索語は3文字以上で入力してください" },
      { status: 400 }
    );
  }

  let targetId: string | null = null;

  if (looksLikeEmailQuery(q)) {
    const row = await prisma.user.findUnique({
      where: { email: q },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }
    targetId = row.id;
  } else if (looksLikeUserIdQuery(q)) {
    const row = await prisma.user.findUnique({
      where: { id: q },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }
    targetId = row.id;
  } else {
    const rows = await prisma.user.findMany({
      where: buildNameContainsWhere(q),
      select: {
        id: true,
        familyName: true,
        givenName: true,
        email: true,
        dateOfBirth: true,
      },
      orderBy: [{ familyName: "asc" }, { givenName: "asc" }],
      take: NAME_SEARCH_TAKE,
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    if (rows.length >= 2) {
      const { candidates, truncated } = sliceNameSearchCandidates(rows);
      return NextResponse.json({
        ambiguous: true,
        truncated,
        candidates: candidates.map((r) => ({
          id: r.id,
          familyName: r.familyName,
          givenName: r.givenName,
          email: r.email,
          dateOfBirth: r.dateOfBirth.toISOString(),
        })),
      });
    }

    targetId = rows[0].id;
  }

  const detail = await buildDetailJson(targetId!);
  if (!detail) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
