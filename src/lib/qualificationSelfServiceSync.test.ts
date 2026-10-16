/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindTemplates,
  mockFindUser,
  mockFindExisting,
  mockFindFirstUser,
  mockTransaction,
  mockHistoryCreateMany,
  mockDeleteMany,
  mockUpdateMany,
  mockCreateMany,
  mockUpsertJla,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockFindTemplates: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindExisting: vi.fn(),
  mockFindFirstUser: vi.fn(),
  mockTransaction: vi.fn(),
  mockHistoryCreateMany: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockUpsertJla: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    qualificationTemplate: { findMany: mockFindTemplates },
    user: { findUnique: mockFindUser, findFirst: mockFindFirstUser },
    qualification: { findMany: mockFindExisting },
    $transaction: mockTransaction,
  },
}));

import { syncUserHeldQualifications } from "./qualificationSelfServiceSync";

const USER_ID = "user-owner";
const TMPL_PENDING = "tmpl-pending";
const TMPL_APPROVED = "tmpl-approved";
const TMPL_IMPORT = "tmpl-import";
const TMPL_REJECTED = "tmpl-rejected";
const TMPL_EXPIRED = "tmpl-expired";

function row(input: {
  id: string;
  templateId: string;
  kind: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  recordOrigin: "USER_APPLICATION" | "ASSOCIATION_IMPORT";
}) {
  return {
    certNumber: null,
    issueDate: null,
    expiryDate: null,
    attachmentUrl: null,
    ...input,
  };
}

describe("syncUserHeldQualifications B-005", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindTemplates.mockResolvedValue([
      { id: TMPL_PENDING, kind: "PendingKind", name: "PendingKind" },
      { id: TMPL_APPROVED, kind: "ApprovedKind", name: "ApprovedKind" },
      { id: TMPL_IMPORT, kind: "ImportKind", name: "ImportKind" },
      { id: TMPL_REJECTED, kind: "RejectedKind", name: "RejectedKind" },
      { id: TMPL_EXPIRED, kind: "ExpiredKind", name: "ExpiredKind" },
    ]);
    mockFindUser.mockResolvedValue({
      jlaProfile: { jlaMemberNumber: "500123456" },
    });
    mockFindFirstUser.mockResolvedValue(null);
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockHistoryCreateMany.mockResolvedValue({ count: 1 });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreateMany.mockResolvedValue({ count: 0 });
    mockUpsertJla.mockResolvedValue({});
    mockAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        qualificationHistory: { createMany: mockHistoryCreateMany },
        qualification: {
          deleteMany: mockDeleteMany,
          updateMany: mockUpdateMany,
          createMany: mockCreateMany,
        },
        userJlaProfile: { upsert: mockUpsertJla },
        auditLog: { create: mockAuditLogCreate },
      })
    );
  });

  it("選択解除した PENDING 自己申告だけ取消し、履歴と監査を同一 transaction に残す", async () => {
    mockFindExisting.mockResolvedValue([
      row({
        id: "q-pending",
        templateId: TMPL_PENDING,
        kind: "PendingKind",
        status: "PENDING",
        recordOrigin: "USER_APPLICATION",
      }),
      row({
        id: "q-approved",
        templateId: TMPL_APPROVED,
        kind: "ApprovedKind",
        status: "APPROVED",
        recordOrigin: "USER_APPLICATION",
      }),
    ]);

    const result = await syncUserHeldQualifications(USER_ID, [], undefined, []);
    expect(result).toEqual({ ok: true });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["q-pending"] },
        userId: USER_ID,
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
        confirmedAt: null,
      },
    });
    expect(mockHistoryCreateMany).toHaveBeenCalled();
    expect(mockHistoryCreateMany.mock.calls[0]?.[0].data[0].id).toBeUndefined();
    expect(mockHistoryCreateMany.mock.calls[0]?.[0].data[0].status).toBe("PENDING");
    expect(mockAuditLogCreate).toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("承認済み自己申告を選択解除しても削除・再作成しない", async () => {
    mockFindExisting.mockResolvedValue([
      row({
        id: "q-approved",
        templateId: TMPL_APPROVED,
        kind: "ApprovedKind",
        status: "APPROVED",
        recordOrigin: "USER_APPLICATION",
      }),
    ]);

    const result = await syncUserHeldQualifications(USER_ID, [], undefined, []);
    expect(result).toEqual({ ok: true });
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("ASSOCIATION_IMPORT は状態を問わず同期削除しない", async () => {
    mockFindExisting.mockResolvedValue([
      row({
        id: "q-import-pending",
        templateId: TMPL_IMPORT,
        kind: "ImportKind",
        status: "PENDING",
        recordOrigin: "ASSOCIATION_IMPORT",
      }),
      row({
        id: "q-import-approved",
        templateId: TMPL_APPROVED,
        kind: "ApprovedKind",
        status: "APPROVED",
        recordOrigin: "ASSOCIATION_IMPORT",
      }),
    ]);

    const result = await syncUserHeldQualifications(USER_ID, [], undefined, []);
    expect(result).toEqual({ ok: true });
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it.each(["REJECTED", "EXPIRED"] as const)(
    "%s の同一 template を選択しても create/delete/自動承認しない",
    async (status) => {
      const templateId = status === "REJECTED" ? TMPL_REJECTED : TMPL_EXPIRED;
      const kind = status === "REJECTED" ? "RejectedKind" : "ExpiredKind";
      mockFindExisting.mockResolvedValue([
        row({
          id: "q-blocked",
          templateId,
          kind,
          status,
          recordOrigin: "USER_APPLICATION",
        }),
      ]);

      const result = await syncUserHeldQualifications(USER_ID, [], undefined, [templateId]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toContain("却下または期限切れ");
      }
      expect(mockFindExisting).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } })
      );
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockCreateMany).not.toHaveBeenCalled();
      expect(mockDeleteMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockAuditLogCreate).not.toHaveBeenCalled();
    }
  );

  it("REJECTED/EXPIRED は選択しなくても占有枠のため再作成しない", async () => {
    mockFindExisting.mockResolvedValue([
      row({
        id: "q-rejected",
        templateId: TMPL_REJECTED,
        kind: "RejectedKind",
        status: "REJECTED",
        recordOrigin: "USER_APPLICATION",
      }),
      row({
        id: "q-expired",
        templateId: TMPL_EXPIRED,
        kind: "ExpiredKind",
        status: "EXPIRED",
        recordOrigin: "USER_APPLICATION",
      }),
    ]);

    const result = await syncUserHeldQualifications(USER_ID, [], undefined, []);
    expect(result).toEqual({ ok: true });
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("新規自己申告は PENDING で自動承認しない", async () => {
    mockFindExisting.mockResolvedValue([]);
    const result = await syncUserHeldQualifications(USER_ID, [], undefined, [TMPL_PENDING]);
    expect(result).toEqual({ ok: true });
    expect(mockCreateMany).toHaveBeenCalled();
    const payload = mockCreateMany.mock.calls[0]?.[0].data as Array<Record<string, unknown>>;
    expect(payload).toEqual([
      expect.objectContaining({
        userId: USER_ID,
        templateId: TMPL_PENDING,
        status: "PENDING",
        recordOrigin: "USER_APPLICATION",
      }),
    ]);
    expect(payload[0]?.confirmedAt).toBeUndefined();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("確認根拠がある PENDING は同期削除しない", async () => {
    mockFindExisting.mockResolvedValue([
      {
        ...row({
          id: "q-pending-confirmed",
          templateId: TMPL_PENDING,
          kind: "PendingKind",
          status: "PENDING",
          recordOrigin: "USER_APPLICATION",
        }),
        confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    const result = await syncUserHeldQualifications(USER_ID, [], undefined, []);
    expect(result).toEqual({ ok: true });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("取消前に承認されると 409 で監査を確定しない", async () => {
    mockFindExisting.mockResolvedValue([
      row({
        id: "q-pending",
        templateId: TMPL_PENDING,
        kind: "PendingKind",
        status: "PENDING",
        recordOrigin: "USER_APPLICATION",
      }),
    ]);
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await syncUserHeldQualifications(USER_ID, [], undefined, []);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "取消が競合しました",
    });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});
