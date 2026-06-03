/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/competitions/[id]/day-ops/heat-result-capture/unconfirm-heat/route";

const { mockTransaction, mockAssertAccess, mockLogAudit } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockAssertAccess: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: { $transaction: mockTransaction },
}));

vi.mock("@/lib/dayOpsAccess", () => ({
  assertDayOpsRecorderWriteAccess: mockAssertAccess,
}));

vi.mock("@/lib/auditLog", () => ({
  getRequestContext: vi.fn(() => ({})),
  logAuditAction: mockLogAudit,
}));

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const futureCompetitionEnd = new Date("2030-06-01T00:00:00.000Z");

function txWithCompetition(extra: Record<string, unknown>) {
  return {
    competition: {
      findUnique: vi.fn().mockResolvedValue({ endDate: futureCompetitionEnd }),
    },
    ...extra,
  };
}

describe("POST unconfirm-heat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAccess.mockResolvedValue({ operatorUserId: "u1" });
  });

  it("公式結果ロック済みは 409", async () => {
    mockTransaction.mockImplementation(async (fn) => {
      const tx = txWithCompetition({
        officialResult: {
          findUnique: vi.fn().mockResolvedValue({ id: "or1", lockedAt: new Date() }),
        },
      });
      return fn(tx);
    });
    const res = await POST(
      request({ eventId: "e1", round: "HEAT", heatIndex: 1 }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(409);
  });

  it("未確定ヒートは 409", async () => {
    mockTransaction.mockImplementation(async (fn) => {
      const tx = txWithCompetition({
        officialResult: {
          findUnique: vi.fn().mockResolvedValue({ id: "or1", lockedAt: null }),
        },
        officialResultHeatConfirmed: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      return fn(tx);
    });
    const res = await POST(
      request({ eventId: "e1", round: "HEAT", heatIndex: 1 }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(409);
  });

  it("確定済みヒートは解除して 200", async () => {
    mockTransaction.mockImplementation(async (fn) => {
      const tx = txWithCompetition({
        officialResult: {
          findUnique: vi.fn().mockResolvedValue({ id: "or1", lockedAt: null }),
        },
        officialResultHeatConfirmed: {
          findUnique: vi.fn().mockResolvedValue({ id: "hc1" }),
          delete: vi.fn().mockResolvedValue({}),
        },
      });
      return fn(tx);
    });
    const res = await POST(
      request({ eventId: "e1", round: "HEAT", heatIndex: 2 }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, heatIndex: 2 });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMPETITION_HEAT_RESULT_UNCONFIRM" })
    );
  });
});
