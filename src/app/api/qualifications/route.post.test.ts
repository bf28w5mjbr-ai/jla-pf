/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockVerifySession,
  mockFindTemplates,
  mockFindUser,
  mockFindExisting,
  mockFindFirstUser,
  mockTransaction,
  mockCreate,
  mockUpdateMany,
  mockFindAfterUpdate,
  mockHistoryCreate,
  mockUserUpdate,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockFindTemplates: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindExisting: vi.fn(),
  mockFindFirstUser: vi.fn(),
  mockTransaction: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockFindAfterUpdate: vi.fn(),
  mockHistoryCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
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
    qualificationTemplate: { findMany: mockFindTemplates },
    qualification: { findMany: mockFindExisting },
    user: { findUnique: mockFindUser, findFirst: mockFindFirstUser },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  },
}));

import { POST } from "./route";

const OWNER_ID = "user-owner";
const TMPL = "tmpl_jla_fixture_1";
const PENDING_UPDATED_AT = new Date("2026-03-01T00:00:00.000Z");

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "q-pending",
    kind: "BLS・WS",
    templateId: TMPL,
    certNumber: null as string | null,
    issueDate: null,
    status: "PENDING" as const,
    expiryDate: null,
    attachmentUrl: null,
    recordOrigin: "USER_APPLICATION" as const,
    confirmedAt: null as Date | null,
    confirmationInvalidatedAt: null,
    confirmedTemplateId: null,
    confirmedCertNumber: null,
    confirmedExpiryDate: null,
    confirmedByUserId: null,
    confirmedByAssociationId: null,
    confirmationMethod: null,
    updatedAt: PENDING_UPDATED_AT,
    ...overrides,
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/qualifications", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/qualifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    mockFindTemplates.mockResolvedValue([
      {
        id: TMPL,
        kind: "BLS・WS",
        name: "BLS・WS",
        description: null,
        domain: null,
        level: null,
        minAge: null,
        prerequisiteExpression: null,
        nextKinds: [],
      },
    ]);
    mockFindUser.mockResolvedValue({
      profile: { dateOfBirth: new Date("1990-01-01T00:00:00.000Z") },
      jlaProfile: { jlaMemberNumber: "500123456" },
      qualifications: [],
    });
    mockFindExisting.mockResolvedValue([]);
    mockFindFirstUser.mockResolvedValue(null);
    mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "q-new",
      ...data,
      user: { id: OWNER_ID, email: "o@example.test", profile: null },
    }));
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindAfterUpdate.mockResolvedValue({
      id: "q-pending",
      status: "PENDING",
      certNumber: "NEW-1",
      user: { id: OWNER_ID, email: "o@example.test", profile: null },
    });
    mockHistoryCreate.mockResolvedValue({ id: "hist-1" });
    mockUserUpdate.mockResolvedValue({});
    mockAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        qualification: {
          create: mockCreate,
          updateMany: mockUpdateMany,
          findUnique: mockFindAfterUpdate,
        },
        qualificationHistory: { create: mockHistoryCreate },
        user: { update: mockUserUpdate },
        auditLog: { create: mockAuditLogCreate },
      })
    );
  });

  it("自己申告の新規作成は PENDING で公式確認を書かない", async () => {
    const res = await POST(
      request({
        kind: "BLS・WS",
        confirmedAt: "2099-01-01T00:00:00.000Z",
        confirmedByUserId: "attacker",
      })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
    const data = mockCreate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe("PENDING");
    expect(data.recordOrigin).toBe("USER_APPLICATION");
    expect(data.confirmedAt).toBeUndefined();
    expect(data.confirmedByUserId).toBeUndefined();
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("既存 PENDING の更新も PENDING のまま確認を payload から書けない", async () => {
    mockFindExisting.mockResolvedValue([pendingRow()]);
    const res = await POST(
      request({
        kind: "BLS・WS",
        certNumber: "NEW-1",
        confirmedAt: "2099-01-01T00:00:00.000Z",
      })
    );
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalled();
    const call = mockUpdateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({
      id: "q-pending",
      userId: OWNER_ID,
      templateId: TMPL,
      recordOrigin: "USER_APPLICATION",
      status: "PENDING",
      confirmedAt: null,
      updatedAt: PENDING_UPDATED_AT,
    });
    expect(call.data.status).toBe("PENDING");
    expect(call.data.certNumber).toBe("NEW-1");
    expect(call.data.confirmedAt).toBeUndefined();
    expect(mockFindAfterUpdate).toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("JLA 承認と競合した既存 PENDING 更新は 409 で承認内容を上書きせず履歴も確定しない", async () => {
    mockFindExisting.mockResolvedValue([pendingRow({ certNumber: "OLD" })]);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(request({ kind: "BLS・WS", certNumber: "NEW-1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("更新が競合しました");
    expect(mockUpdateMany).toHaveBeenCalled();
    expect(mockFindAfterUpdate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("確認根拠がある PENDING は本人更新 409 で上書きしない", async () => {
    mockFindExisting.mockResolvedValue([
      pendingRow({
        certNumber: "OLD",
        confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
        confirmedTemplateId: TMPL,
        confirmedCertNumber: "OLD",
        confirmedByUserId: "jla-admin",
        confirmedByAssociationId: "assoc_jla_fixture_1",
        confirmationMethod: "REVIEW",
      }),
    ]);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(request({ kind: "BLS・WS", certNumber: "NEW-1" }));
    expect(res.status).toBe(409);
    expect(mockUpdateMany.mock.calls[0]?.[0].where.confirmedAt).toBeNull();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockFindAfterUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("PENDING同士の同時更新は409で履歴・監査が確定しない", async () => {
    mockFindExisting.mockResolvedValue([pendingRow()]);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(request({ kind: "BLS・WS", certNumber: "NEW-2" }));
    expect(res.status).toBe(409);
    expect(mockUpdateMany.mock.calls[0]?.[0].where.updatedAt).toEqual(PENDING_UPDATED_AT);
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    expect(mockFindAfterUpdate).not.toHaveBeenCalled();
  });

  it("POST監査失敗時はトランザクションが失敗する", async () => {
    mockAuditLogCreate.mockRejectedValue(new Error("audit write failed"));
    const res = await POST(request({ kind: "BLS・WS" }));
    expect(res.status).toBe(500);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });
});
