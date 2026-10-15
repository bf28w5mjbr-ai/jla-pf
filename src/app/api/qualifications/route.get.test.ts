/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV,
  QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV,
} from "@/lib/qualificationReviewConfig";

const {
  mockVerifySession,
  mockFindMany,
  mockCount,
  mockFindUser,
  mockFindUsers,
  mockFindAssociation,
  mockFindAssociationAdmin,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindUsers: vi.fn(),
  mockFindAssociation: vi.fn(),
  mockFindAssociationAdmin: vi.fn(),
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
      findMany: mockFindMany,
      count: mockCount,
    },
    user: {
      findUnique: mockFindUser,
      findMany: mockFindUsers,
    },
    association: {
      findUnique: mockFindAssociation,
    },
    associationAdmin: {
      findUnique: mockFindAssociationAdmin,
    },
  },
}));

import { GET } from "./route";

const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";
const PF_ADMIN_ID = "user-pf-admin";
const ASSOC_ADMIN_ID = "user-assoc-admin-a";
const JLA_ADMIN_ID = "user-jla-admin";
const JLA_ASSOC_ID = "assoc_jla_fixture_1";
const ALLOWED_TMPL = "tmpl_jla_fixture_1";
const OTHER_TMPL = "tmpl_other_fixture";

function request(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/qualifications${qs}`, { method: "GET" });
}

function clearReviewEnv() {
  delete process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV];
  delete process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];
}

function setReviewEnv() {
  process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = JLA_ASSOC_ID;
  process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify([ALLOWED_TMPL]);
}

describe("GET /api/qualifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReviewEnv();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockFindUsers.mockResolvedValue([]);
    mockFindAssociation.mockResolvedValue(null);
    mockFindAssociationAdmin.mockResolvedValue(null);
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
  });

  afterEach(() => {
    clearReviewEnv();
  });

  it("未ログインは 401", async () => {
    mockVerifySession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("一般ユーザーは自分の資格だけを問い合わせ、メール select をしない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    await GET(request());
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const arg = mockFindMany.mock.calls[0]?.[0] as {
      where: unknown;
      include: { user: { select: Record<string, unknown> } };
    };
    expect(arg.where).toEqual({
      AND: [{ OR: [{ userId: OWNER_ID }] }],
    });
    expect(arg.include.user.select).toEqual({ id: true });
    expect(arg.include.user.select.email).toBeUndefined();
    expect(mockCount.mock.calls[0]?.[0]).toEqual({ where: arg.where });
  });

  it("一般ユーザーが他人の userId を指定すると 403", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    const res = await GET(request(`?userId=${OTHER_ID}`));
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("設定なしの協会管理者は自分の資格のみ", async () => {
    mockVerifySession.mockResolvedValue({ userId: ASSOC_ADMIN_ID });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const arg = mockFindMany.mock.calls[0]?.[0] as { where: unknown };
    expect(arg.where).toEqual({
      AND: [{ OR: [{ userId: ASSOC_ADMIN_ID }] }],
    });
  });

  it("設定なしの協会管理者が権限外ユーザーの userId を指定すると 403", async () => {
    mockVerifySession.mockResolvedValue({ userId: ASSOC_ADMIN_ID });
    const res = await GET(request(`?userId=${OTHER_ID}`));
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("PF_ADMIN は一覧でメールを含められる", async () => {
    mockVerifySession.mockResolvedValue({ userId: PF_ADMIN_ID });
    await GET(request());
    const arg = mockFindMany.mock.calls[0]?.[0] as {
      where: unknown;
      include: { user: { select: Record<string, unknown> } };
    };
    expect(arg.where).toEqual({});
    expect(arg.include.user.select.email).toBe(true);
    expect(JSON.stringify(arg.include.user.select)).not.toMatch(/phone/i);
  });

  it("query の kind だけでは権限 OR を外せない", async () => {
    mockVerifySession.mockResolvedValue({ userId: OWNER_ID });
    await GET(request("?kind=BLS%E3%83%BBS"));
    const arg = mockFindMany.mock.calls[0]?.[0] as { where: { AND: unknown[] } };
    expect(arg.where.AND).toEqual(
      expect.arrayContaining([{ OR: [{ userId: OWNER_ID }] }])
    );
  });
});

describe("GET /api/qualifications JLA 審査者", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setReviewEnv();
    mockCount.mockResolvedValue(1);
    mockFindUsers.mockResolvedValue([]);
    mockFindAssociation.mockResolvedValue({
      id: JLA_ASSOC_ID,
      name: "日本ライフセービング協会",
      status: "APPROVED",
    });
    mockFindAssociationAdmin.mockImplementation(
      async ({ where }: { where: { userId_associationId: { userId: string } } }) => {
        if (where.userId_associationId.userId === JLA_ADMIN_ID) return { role: "ADMIN" };
        if (where.userId_associationId.userId === JLA_ADMIN_ID + "-member") return { role: "MEMBER" };
        return null;
      }
    );
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === PF_ADMIN_ID) return { role: "PF_ADMIN" };
      return { role: "USER" };
    });
  });

  afterEach(() => {
    clearReviewEnv();
  });

  it("JLA 管理者の where は本人分 OR 許可 templateId で count と一致", async () => {
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    mockFindMany.mockResolvedValue([]);
    await GET(request());
    const arg = mockFindMany.mock.calls[0]?.[0] as { where: unknown };
    expect(arg.where).toEqual({
      AND: [
        {
          OR: [{ userId: JLA_ADMIN_ID }, { templateId: { in: [ALLOWED_TMPL] } }],
        },
      ],
    });
    expect(mockCount.mock.calls[0]?.[0]).toEqual({ where: arg.where });
  });

  it("userId 指定でも許可リスト外の他人行は権限 OR が残る", async () => {
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    mockFindMany.mockResolvedValue([]);
    await GET(request(`?userId=${OTHER_ID}&kind=SecretKind`));
    const arg = mockFindMany.mock.calls[0]?.[0] as { where: { AND: unknown[] } };
    expect(arg.where.AND).toEqual(
      expect.arrayContaining([
        { userId: OTHER_ID },
        { kind: "SecretKind" },
        { OR: [{ userId: JLA_ADMIN_ID }, { templateId: { in: [ALLOWED_TMPL] } }] },
      ])
    );
  });

  it("許可対象行はメール、許可外の本人行は id のみ", async () => {
    mockVerifySession.mockResolvedValue({ userId: JLA_ADMIN_ID });
    mockFindMany.mockResolvedValue([
      {
        id: "q-own-out",
        userId: JLA_ADMIN_ID,
        templateId: OTHER_TMPL,
        kind: "OTHER",
        user: { id: JLA_ADMIN_ID },
      },
      {
        id: "q-review",
        userId: OTHER_ID,
        templateId: ALLOWED_TMPL,
        kind: "BLS・WS",
        user: { id: OTHER_ID },
      },
    ]);
    mockFindUsers.mockResolvedValue([
      {
        id: OTHER_ID,
        email: "other@example.test",
        profile: { familyName: "佐藤", givenName: "花子" },
      },
    ]);
    const res = await GET(request());
    const body = await res.json();
    expect(body.qualifications[0].user).toEqual({ id: JLA_ADMIN_ID });
    expect(body.qualifications[0].user).not.toHaveProperty("email");
    expect(body.qualifications[1].user).toEqual({
      id: OTHER_ID,
      email: "other@example.test",
      profile: { familyName: "佐藤", givenName: "花子" },
    });
    expect(JSON.stringify(body)).not.toMatch(/phone/i);
  });

  it("MEMBER は協会審査者にならない", async () => {
    mockVerifySession.mockResolvedValue({ userId: `${JLA_ADMIN_ID}-member` });
    mockFindMany.mockResolvedValue([]);
    await GET(request());
    const arg = mockFindMany.mock.calls[0]?.[0] as { where: unknown };
    expect(arg.where).toEqual({
      AND: [{ OR: [{ userId: `${JLA_ADMIN_ID}-member` }] }],
    });
  });
});
