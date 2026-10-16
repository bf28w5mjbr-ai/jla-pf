/** @vitest-environment node */

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifySessionCached, mockResolveAccess, mockFindMany } = vi.hoisted(() => ({
  mockVerifySessionCached: vi.fn(),
  mockResolveAccess: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: "session-token" }),
  })),
}));

vi.mock("@/lib/auth", () => ({
  verifySessionCached: mockVerifySessionCached,
}));

vi.mock("@/lib/qualificationAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/qualificationAccess")>();
  return {
    ...actual,
    resolveQualificationAccessContext: mockResolveAccess,
  };
});

vi.mock("@/server/db", () => ({
  prisma: {
    qualification: {
      findMany: mockFindMany,
    },
  },
}));

import AdminQualificationsPage from "./page";

const ALLOWED_TMPL = "tmpl_jla_fixture_1";
const JLA_ADMIN_ID = "user-jla-admin";

function collectTableUsers(node: ReactNode): Array<Record<string, unknown>> {
  const users: Array<Record<string, unknown>> = [];
  const visit = (current: ReactNode) => {
    if (!current) return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) return;
    const el = current as ReactElement<{
      qualifications?: Array<{ user: Record<string, unknown> }>;
      children?: ReactNode;
    }>;
    if (Array.isArray(el.props.qualifications)) {
      for (const row of el.props.qualifications) {
        users.push(row.user);
      }
    }
    visit(el.props.children);
  };
  visit(node);
  return users;
}

describe("AdminQualificationsPage JLA queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionCached.mockResolvedValue({ userId: JLA_ADMIN_ID });
    mockResolveAccess.mockResolvedValue({
      isPfAdmin: false,
      isJlaReviewer: true,
      reviewTemplateIds: [ALLOWED_TMPL],
    });
    mockFindMany.mockResolvedValue([
      {
        id: "q1",
        kind: "BLS・WS",
        certNumber: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        issueDate: null,
        expiryDate: null,
        template: { name: "BLS・WS", kind: "BLS・WS" },
        user: {
          id: "user-owner",
          email: "owner@example.test",
          profile: { familyName: "山田", givenName: "太郎" },
        },
      },
    ]);
  });

  it("JLA の findMany は PENDING と許可 templateId のみで、select に電話がない", async () => {
    await AdminQualificationsPage();
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const arg = mockFindMany.mock.calls[0]?.[0] as {
      where: unknown;
      include: { user: { select: Record<string, unknown> } };
    };
    expect(arg.where).toEqual({
      status: "PENDING",
      templateId: { in: [ALLOWED_TMPL] },
    });
    expect(arg.include.user.select).not.toHaveProperty("contact");
    expect(JSON.stringify(arg.include.user.select)).not.toMatch(/phone/i);
  });

  it("JLA のクライアント props に phoneNumber を含めない", async () => {
    const tree = await AdminQualificationsPage();
    const users = collectTableUsers(tree as ReactNode);
    expect(users).toHaveLength(1);
    expect(users[0]).toEqual({
      id: "user-owner",
      email: "owner@example.test",
      familyName: "山田",
      givenName: "太郎",
    });
    expect(users[0]).not.toHaveProperty("phoneNumber");
    expect(JSON.stringify(users[0])).not.toMatch(/phone/i);
  });
});
