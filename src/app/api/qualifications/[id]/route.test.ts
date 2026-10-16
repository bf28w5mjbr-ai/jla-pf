/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV,
  QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV,
} from "@/lib/qualificationReviewConfig";

const {
  mockVerifySession,
  mockFindQualification,
  mockFindUser,
  mockDeleteQualification,
  mockAuditLogCreate,
  mockTransaction,
  mockFindAssociation,
  mockFindAssociationAdmin,
  mockUpdateMany,
  mockHistoryCreate,
  mockFindAfterUpdate,
  mockUserUpdate,
  mockDeleteMany,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockFindQualification: vi.fn(),
  mockFindUser: vi.fn(),
  mockDeleteQualification: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockFindAssociation: vi.fn(),
  mockFindAssociationAdmin: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockHistoryCreate: vi.fn(),
  mockFindAfterUpdate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: "session-token" }),
  })),
}));

vi.mock("@/lib/auth", () => ({
  verifySession: mockVerifySession,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    qualification: {
      findUnique: mockFindQualification,
      delete: mockDeleteQualification,
    },
    user: { findUnique: mockFindUser },
    auditLog: { create: mockAuditLogCreate },
    association: { findUnique: mockFindAssociation },
    associationAdmin: { findUnique: mockFindAssociationAdmin },
    $transaction: mockTransaction,
  },
}));

import { DELETE, GET, PATCH } from "./route";

const QUALIFICATION_ID = "clxxxxxxxxxxxxxxxxxxxxxxxx";
const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";
const PF_ADMIN_ID = "user-pf-admin";
const ASSOC_ADMIN_ID = "user-assoc-admin-a";
const JLA_ADMIN_ID = "user-jla-admin";
const JLA_ASSOC_ID = "assoc_jla_fixture_1";
const ALLOWED_TMPL = "tmpl_jla_fixture_1";
const OTHER_TMPL = "tmpl_other_fixture";

const QUALIFICATION_ROW = {
  id: QUALIFICATION_ID,
  userId: OWNER_ID,
  kind: "BLS・WS",
  templateId: ALLOWED_TMPL,
  certNumber: "CERT-1",
  issueDate: null,
  expiryDate: null,
  status: "APPROVED",
  attachmentUrl: null,
  recordOrigin: "USER_APPLICATION",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  confirmedAt: null,
  confirmedByUserId: null,
  confirmedByAssociationId: null,
  confirmationMethod: null,
  confirmedTemplateId: null,
  confirmedCertNumber: null,
  confirmedExpiryDate: null,
  confirmationInvalidatedAt: null,
  template: { id: ALLOWED_TMPL, kind: "BLS・WS", name: "BLS・WS" },
};

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/qualifications/${QUALIFICATION_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

const ctx = { params: Promise.resolve({ id: QUALIFICATION_ID }) };

function jsonHasNoPhone(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(/phone/i);
}

function clearReviewEnv() {
  delete process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV];
  delete process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];
}

function setReviewEnv() {
  process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = JLA_ASSOC_ID;
  process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify([ALLOWED_TMPL]);
}

function mockJlaAssociationLookups() {
  mockFindAssociation.mockResolvedValue({
    id: JLA_ASSOC_ID,
    name: "日本ライフセービング協会",
    status: "APPROVED",
  });
  mockFindAssociationAdmin.mockImplementation(
    async ({ where }: { where: { userId_associationId: { userId: string } } }) => {
      if (where.userId_associationId.userId === JLA_ADMIN_ID) return { role: "ADMIN" };
      return null;
    }
  );
}

describe("GET /api/qualifications/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReviewEnv();
    mockFindQualification.mockResolvedValue(QUALIFICATION_ROW);
    mockFindAssociation.mockResolvedValue(null);
    mockFindAssociationAdmin.mockResolvedValue(null);
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      if (where.id === OWNER_ID) {
        return {
          id: OWNER_ID,
          role: "USER",
          email: "owner@example.test",
          profile: { familyName: "山田", givenName: "太郎" },
        };
      }
      return { id: where.id, role: "USER" };
    });
  });

  afterEach(() => {
    clearReviewEnv();
  });

  it("未ログインは 401", async () => {
    mockVerifySession.mockResolvedValue(null);
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(401);
    expect(mockFindQualification).not.toHaveBeenCalled();
  });

  it("本人は資格を取得でき、メール・電話は返さない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(QUALIFICATION_ID);
    expect(body.kind).toBe("BLS・WS");
    expect(body.user).toEqual({ id: OWNER_ID });
    expect(body.user.email).toBeUndefined();
    jsonHasNoPhone(body);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("無関係のログインユーザーは 403 で連絡先を返さない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OTHER_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("権限がありません");
    expect(body.user).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("@");
    jsonHasNoPhone(body);
  });

  it("協会Aの管理者は権限外の資格をGETできない", async () => {
    mockVerifySession.mockResolvedValue({ userId: ASSOC_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.user).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("PF_ADMIN は氏名とメールを取得でき、電話は返さない", async () => {
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({
      id: OWNER_ID,
      email: "owner@example.test",
      profile: { familyName: "山田", givenName: "太郎" },
    });
    jsonHasNoPhone(body);
  });

  it("存在しない資格は 404", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    mockFindQualification.mockResolvedValue(null);
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(404);
  });

  it("本人の許可リスト外資格は閲覧可能", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      userId: JLA_ADMIN_ID,
      templateId: OTHER_TMPL,
    });
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === JLA_ADMIN_ID) return { id: JLA_ADMIN_ID, role: "USER" };
      return { id: where.id, role: "USER" };
    });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: JLA_ADMIN_ID });
  });

  it("JLA 管理者でも許可外の他人資格は GET 不可（連絡先未取得）", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      templateId: OTHER_TMPL,
    });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(403);
    const holderLookups = mockFindUser.mock.calls.filter((call) => {
      const arg = call[0] as { where?: { id?: string } } | undefined;
      return arg?.where?.id === OWNER_ID;
    });
    expect(holderLookups).toHaveLength(0);
  });

  it("協会名が完全一致しないと JLA 審査にならない", async () => {
    setReviewEnv();
    mockFindAssociation.mockResolvedValue({
      id: JLA_ASSOC_ID,
      name: "別の協会",
      status: "APPROVED",
    });
    mockFindAssociationAdmin.mockResolvedValue({ role: "ADMIN" });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(403);
  });

  it("協会 status が APPROVED 以外なら JLA 審査にならない", async () => {
    setReviewEnv();
    mockFindAssociation.mockResolvedValue({
      id: JLA_ASSOC_ID,
      name: "日本ライフセービング協会",
      status: "PENDING",
    });
    mockFindAssociationAdmin.mockResolvedValue({ role: "ADMIN" });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(403);
  });

  it("JLA 管理者は許可内の他人資格をメール付きで GET でき、電話は含まない", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await GET(request("GET"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("owner@example.test");
    jsonHasNoPhone(body);
  });
});

describe("PATCH /api/qualifications/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReviewEnv();
    mockFindQualification.mockResolvedValue(QUALIFICATION_ROW);
    mockFindAssociation.mockResolvedValue(null);
    mockFindAssociationAdmin.mockResolvedValue(null);
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockHistoryCreate.mockResolvedValue({ id: "hist-1" });
    mockUserUpdate.mockResolvedValue({});
    mockFindAfterUpdate.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "REJECTED",
      user: { id: OWNER_ID, email: "owner@example.test", profile: null },
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        qualification: {
          updateMany: mockUpdateMany,
          findUnique: mockFindAfterUpdate,
        },
        qualificationHistory: { create: mockHistoryCreate },
        user: { update: mockUserUpdate },
        auditLog: { create: mockAuditLogCreate },
      })
    );
    mockAuditLogCreate.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    clearReviewEnv();
  });

  it("協会Aの管理者は権限外の資格をPATCHできない", async () => {
    mockVerifySession.mockResolvedValue({ userId: ASSOC_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockFindQualification).not.toHaveBeenCalled();
  });

  it("一般ユーザーのPATCHは 403 でDB更新しない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("本人でも許可リスト外は PATCH 不可", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      userId: JLA_ADMIN_ID,
      templateId: OTHER_TMPL,
    });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("JLA 管理者でも許可外の他人資格は PATCH 不可", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      templateId: OTHER_TMPL,
    });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("PF_ADMIN は資格を更新でき、transaction 内で履歴と監査を保存する", async () => {
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockHistoryCreate).toHaveBeenCalled();
    expect(mockHistoryCreate.mock.calls[0]?.[0].data.status).toBe("APPROVED");
    expect(mockFindAfterUpdate).toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalled();
    expect(mockUpdateMany.mock.calls[0]?.[0].where).toEqual({
      id: QUALIFICATION_ID,
      userId: OWNER_ID,
      templateId: ALLOWED_TMPL,
      updatedAt: QUALIFICATION_ROW.updatedAt,
    });
  });

  it("JLA 管理者の PATCH は読取値と許可 templateId を where に残す", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateMany.mock.calls[0]?.[0].where).toEqual({
      AND: [
        {
          id: QUALIFICATION_ID,
          userId: OWNER_ID,
          templateId: ALLOWED_TMPL,
          updatedAt: QUALIFICATION_ROW.updatedAt,
        },
        { templateId: { in: [ALLOWED_TMPL] } },
      ],
    });
    expect(mockHistoryCreate).toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("updateMany.count が 0 なら 409 で履歴・監査・プロフィール更新をしない", async () => {
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("更新が競合しました");
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("監査失敗時は transaction が失敗し成功応答しない", async () => {
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    mockAuditLogCreate.mockRejectedValue(new Error("audit write failed"));
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(500);
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockHistoryCreate).toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("PF_ADMIN の承認は公式確認を書かない（payload の確認欄も無視）", async () => {
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "PENDING",
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await PATCH(
      request("PATCH", {
        status: "APPROVED",
        confirmedAt: "2099-01-01T00:00:00.000Z",
        confirmedByUserId: "attacker",
        confirmationInvalidatedAt: null,
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const data = mockUpdateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe("APPROVED");
    expect(data.confirmedAt).toBeUndefined();
    expect(data.confirmedByUserId).toBeUndefined();
    expect(data.confirmationInvalidatedAt).toBeUndefined();
  });

  it("JLA 管理者の APPROVED は協会・許可 template 付きで公式確認を書く", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "PENDING",
    });
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(200);
    const data = mockUpdateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe("APPROVED");
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(data.confirmedByUserId).toBe(JLA_ADMIN_ID);
    expect(data.confirmedByAssociationId).toBe(JLA_ASSOC_ID);
    expect(data.confirmationMethod).toBe("REVIEW");
    expect(data.confirmationInvalidatedAt).toBeNull();
  });

  it("PF 兼 JLA でも許可外 template では公式確認を書かない", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "PENDING",
      templateId: OTHER_TMPL,
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(200);
    const data = mockUpdateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.confirmedAt).toBeUndefined();
  });

  it("PF 兼 JLA でも協会名が一致しないと公式確認を書かない", async () => {
    setReviewEnv();
    mockFindAssociation.mockResolvedValue({
      id: JLA_ASSOC_ID,
      name: "別の協会",
      status: "APPROVED",
    });
    mockFindAssociationAdmin.mockResolvedValue({ role: "ADMIN" });
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "PENDING",
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateMany.mock.calls[0]?.[0].data.confirmedAt).toBeUndefined();
  });

  it("PF 兼 JLA でも協会役割が ADMIN でなければ公式確認を書かない", async () => {
    setReviewEnv();
    mockFindAssociation.mockResolvedValue({
      id: JLA_ASSOC_ID,
      name: "日本ライフセービング協会",
      status: "APPROVED",
    });
    mockFindAssociationAdmin.mockResolvedValue({ role: "STAFF" });
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "PENDING",
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateMany.mock.calls[0]?.[0].data.confirmedAt).toBeUndefined();
  });

  it("確認済み行の却下は確認を無効化する", async () => {
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
      confirmedByUserId: JLA_ADMIN_ID,
      confirmedByAssociationId: JLA_ASSOC_ID,
      confirmationMethod: "REVIEW",
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "REJECTED" }), ctx);
    expect(res.status).toBe(200);
    const data = mockUpdateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.confirmationInvalidatedAt).toBeInstanceOf(Date);
    expect(data.confirmedAt).toBeUndefined();
    expect(mockHistoryCreate.mock.calls[0]?.[0].data.changeType).toBe("CONFIRMATION_INVALIDATED");
  });

  it("無効化後に PF が再承認しても公式確認は復活しない", async () => {
    mockFindQualification.mockResolvedValue({
      ...QUALIFICATION_ROW,
      status: "REJECTED",
      confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
      confirmationInvalidatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await PATCH(request("PATCH", { status: "APPROVED" }), ctx);
    expect(res.status).toBe(200);
    const data = mockUpdateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe("APPROVED");
    expect(data.confirmedAt).toBeUndefined();
    expect(data.confirmationInvalidatedAt).toBeUndefined();
  });
});

const OWNER_PENDING_ROW = {
  id: QUALIFICATION_ID,
  userId: OWNER_ID,
  kind: "BLS・WS",
  templateId: ALLOWED_TMPL,
  certNumber: null,
  issueDate: null,
  expiryDate: null,
  status: "PENDING" as const,
  attachmentUrl: null,
  recordOrigin: "USER_APPLICATION" as const,
  confirmedAt: null,
};

describe("DELETE /api/qualifications/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReviewEnv();
    mockFindQualification.mockResolvedValue({ ...OWNER_PENDING_ROW });
    mockFindAssociation.mockResolvedValue(null);
    mockFindAssociationAdmin.mockResolvedValue(null);
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
    mockDeleteQualification.mockResolvedValue({ id: QUALIFICATION_ID });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockHistoryCreate.mockResolvedValue({ id: "hist-1" });
    mockAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        qualification: {
          delete: mockDeleteQualification,
          deleteMany: mockDeleteMany,
        },
        qualificationHistory: { create: mockHistoryCreate },
        auditLog: { create: mockAuditLogCreate },
      })
    );
  });

  afterEach(() => {
    clearReviewEnv();
  });

  it("協会Aの管理者は権限外の資格をDELETEできない", async () => {
    mockVerifySession.mockResolvedValue({ userId: ASSOC_ADMIN_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(mockDeleteQualification).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("JLA 審査者でも他人 DELETE は不可（PF 判定と共有しない）", async () => {
    setReviewEnv();
    mockJlaAssociationLookups();
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(mockDeleteQualification).not.toHaveBeenCalled();
  });

  it("一般ユーザーが他人の資格をDELETEすると 403 で削除しない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OTHER_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(mockDeleteQualification).not.toHaveBeenCalled();
  });

  it("PF_ADMIN は他人の資格を削除できる", async () => {
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(mockDeleteQualification).toHaveBeenCalledWith({ where: { id: QUALIFICATION_ID } });
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("PF_ADMIN は自分の承認済み資格も管理削除できる", async () => {
    mockFindQualification.mockResolvedValue({
      ...OWNER_PENDING_ROW,
      userId: PF_ADMIN_ID,
      status: "APPROVED",
    });
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(mockDeleteQualification).toHaveBeenCalledWith({ where: { id: QUALIFICATION_ID } });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("本人は USER_APPLICATION かつ PENDING を取消できる", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(mockHistoryCreate).toHaveBeenCalled();
    expect(mockHistoryCreate.mock.calls[0]?.[0].data.status).toBe("PENDING");
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        id: QUALIFICATION_ID,
        userId: OWNER_ID,
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
        confirmedAt: null,
      },
    });
    expect(mockAuditLogCreate).toHaveBeenCalled();
    expect(mockDeleteQualification).not.toHaveBeenCalled();
  });

  it("本人の APPROVED は 403 で削除しない", async () => {
    mockFindQualification.mockResolvedValue({
      ...OWNER_PENDING_ROW,
      status: "APPROVED",
    });
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const)(
    "ASSOCIATION_IMPORT の %s は本人削除 403",
    async (status) => {
      mockFindQualification.mockResolvedValue({
        ...OWNER_PENDING_ROW,
        status,
        recordOrigin: "ASSOCIATION_IMPORT",
      });
      mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
      const res = await DELETE(request("DELETE"), ctx);
      expect(res.status).toBe(403);
      expect(mockTransaction).not.toHaveBeenCalled();
    }
  );

  it.each(["REJECTED", "EXPIRED"] as const)(
    "本人の USER_APPLICATION %s は物理削除しない",
    async (status) => {
      mockFindQualification.mockResolvedValue({
        ...OWNER_PENDING_ROW,
        status,
      });
      mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
      const res = await DELETE(request("DELETE"), ctx);
      expect(res.status).toBe(403);
      expect(mockDeleteMany).not.toHaveBeenCalled();
    }
  );

  it("確認根拠がある PENDING は本人削除しない", async () => {
    mockFindQualification.mockResolvedValue({
      ...OWNER_PENDING_ROW,
      confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("取消前に承認されると 409 で履歴・監査を確定しない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    mockDeleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(request("DELETE"), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("取消が競合しました");
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});
