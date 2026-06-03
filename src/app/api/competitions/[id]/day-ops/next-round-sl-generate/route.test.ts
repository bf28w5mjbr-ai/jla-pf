/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/competitions/[id]/day-ops/next-round-sl-generate/route";

const { mockGenerate, mockAssertAccess, mockLogAudit } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockAssertAccess: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock("@/lib/startListNextRoundFromOfficial", () => ({
  generateNextRoundStartListFromOfficial: mockGenerate,
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

describe("POST next-round-sl-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAccess.mockResolvedValue({ operatorUserId: "u1" });
  });

  it("ガード失敗は 409", async () => {
    mockGenerate.mockResolvedValue({
      ok: false,
      error: "前ラウンドの全ヒートがリザルト確定するまで SL を生成できません",
      code: "CANNOT_CREATE",
    });
    const res = await POST(
      request({ eventId: "e1", fromRound: "HEAT", mode: "create" }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("CANNOT_CREATE");
  });

  it("マーシャル開始後の通常再生成拒否", async () => {
    mockGenerate.mockResolvedValue({
      ok: false,
      error: "次ラマーシャル開始済みのため通常再生成はできません",
      code: "CANNOT_REGENERATE",
    });
    const res = await POST(
      request({ eventId: "e1", fromRound: "HEAT", mode: "regenerate" }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(409);
  });

  it("成功時は fingerprint を返す", async () => {
    mockGenerate.mockResolvedValue({
      ok: true,
      toRound: "SEMI",
      participantCount: 16,
      heatCount: 2,
      fingerprint: "fp-new",
    });
    const res = await POST(
      request({ eventId: "e1", fromRound: "HEAT", mode: "create" }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      toRound: "SEMI",
      fingerprint: "fp-new",
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMPETITION_NEXT_ROUND_SL_GENERATE" })
    );
  });
});
