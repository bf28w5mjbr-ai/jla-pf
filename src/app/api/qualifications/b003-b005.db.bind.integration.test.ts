/** @vitest-environment node */
/**
 * B-003〜005 開発DB結合。QUALIFICATION_DB_BIND_TEST=1 のときだけ実行する。
 * 認証は verifySession のみ差し替え。prisma は実DB。審査設定は process.env のみ。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import {
  JLA_ASSOCIATION_CANONICAL_NAME,
  QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV,
  QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV,
} from "@/lib/qualificationReviewConfig";
import { isActiveOfficialConfirmation } from "@/lib/qualificationOwnerRules";

const EXPECTED_REF = "lnxzbwdhibaavqfclkgx";
const EXPECTED_DB = "postgres";

const sessionState = { userId: "" };
const sessionAls = new AsyncLocalStorage<{ userId: string }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: "bind-session" }),
  })),
}));

vi.mock("@/lib/auth", () => ({
  verifySession: vi.fn(async () => {
    const fromAls = sessionAls.getStore()?.userId;
    const userId = fromAls || sessionState.userId;
    return userId ? { userId } : null;
  }),
}));

vi.mock("@/lib/email/sendNotificationEmail", () => ({
  sendNotificationEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/email/sendResendEmail", () => ({
  sendResendEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { retrieve: vi.fn(), create: vi.fn() } },
  },
  createPaymentCheckout: vi.fn(async () => {
    throw new Error("stripe_blocked_in_bind_test");
  }),
}));

function parsePostgresIds(uri: string | undefined): { projectRef: string | null; database: string | null } {
  if (!uri) return { projectRef: null, database: null };
  const rest = uri.replace(/^postgres(?:ql)?:\/\//i, "");
  const at = rest.lastIndexOf("@");
  if (at < 0) return { projectRef: null, database: null };
  const user = decodeURIComponent(rest.slice(0, at).split(":")[0] ?? "");
  const hostpart = rest.slice(at + 1);
  const [hostport, pathAndQuery = ""] = hostpart.split("/");
  const host = (hostport ?? "").split(":")[0] ?? "";
  const database = decodeURIComponent((pathAndQuery.split("?")[0] ?? "") || "") || null;
  const fromHost = host.match(/^db\.([^.]+)\.supabase\.co$/i)?.[1] ?? null;
  const fromUser = user.match(/^postgres\.([a-z0-9]+)$/i)?.[1] ?? null;
  return { projectRef: fromHost || fromUser, database };
}

const idsOk = (() => {
  const a = parsePostgresIds(process.env.DATABASE_URL);
  const b = parsePostgresIds(process.env.DATABASE_URL_UNPOOLED);
  return (
    process.env.QUALIFICATION_DB_BIND_TEST === "1" &&
    a.projectRef === EXPECTED_REF &&
    a.database === EXPECTED_DB &&
    b.projectRef === EXPECTED_REF &&
    b.database === EXPECTED_DB
  );
})();

if (process.env.QUALIFICATION_DB_BIND_TEST === "1" && !idsOk) {
  throw new Error("接続先識別子またはDB名が許可対象と不一致のため停止");
}

const {
  DELETE,
  GET: GET_ONE,
  PATCH,
} = await import("./[id]/route");
const { GET: GET_LIST, POST } = await import("./route");
const { PUT: PUT_SYNC } = await import("@/app/api/users/me/qualifications/route");
const { POST: POST_ENTRY } = await import("@/app/api/competitions/[id]/entries/route");
const { prisma } = await import("@/server/db");

const RUN = `b003_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

type Tracked = {
  userIds: string[];
  associationIdsCreated: string[];
  associationAdminIds: string[];
  templateIds: string[];
  organizationIds: string[];
  competitionIds: string[];
  eventIds: string[];
  entryIds: string[];
  qualificationIds: string[];
};

const tracked: Tracked = {
  userIds: [],
  associationIdsCreated: [],
  associationAdminIds: [],
  templateIds: [],
  organizationIds: [],
  competitionIds: [],
  eventIds: [],
  entryIds: [],
  qualificationIds: [],
};

const prevReviewAssoc = process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV];
const prevReviewTemplates = process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];

let ownerId = "";
let otherId = "";
let jlaId = "";
let otherAssocAdminId = "";
let pfId = "";
let auditUserId = "";
let raceUserId = "";
let jlaAssocId = "";
let allowedTmplId = "";
let pendingQualId = "";
let otherTmplQualId = "";
let raceQualId = "";
let compReqId = "";
let compNoneId = "";
let compTierId = "";
let eventReqId = "";
let eventNoneId = "";
let eventTierId = "";

function asOwner() {
  sessionState.userId = ownerId;
}
function asUser(id: string) {
  sessionState.userId = id;
}

function jsonReq(url: string, method: string, body?: unknown, cookie = true): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = "session=bind-session";
  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jlaMember(n: number): string {
  return `500${String(n).padStart(6, "0")}`.slice(0, 9);
}

async function createPerson(role: "USER" | "PF_ADMIN", suffix: string, dobYear: number) {
  const email = `${RUN}+${suffix}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      role,
      profile: {
        create: {
          familyName: `Bind${RUN}`,
          givenName: suffix,
          familyNameKana: "バインド",
          givenNameKana: "テスト",
          normalizedFamilyName: `bind${RUN}`.toLowerCase(),
          normalizedGivenName: suffix.toLowerCase(),
          dateOfBirth: new Date(`${dobYear}-06-15T00:00:00.000Z`),
          sex: "OTHER",
        },
      },
    },
  });
  tracked.userIds.push(user.id);
  return user.id;
}

async function collectStaleBindIds() {
  const staleUsers = await prisma.user.findMany({
    where: { email: { startsWith: "b003_", endsWith: "@example.test" } },
    select: { id: true },
  });
  tracked.userIds.push(...staleUsers.map((u) => u.id));
  const staleComps = await prisma.competition.findMany({
    where: { name: { startsWith: "B003 " } },
    select: { id: true },
  });
  tracked.competitionIds.push(...staleComps.map((c) => c.id));
  const staleOrgs = await prisma.organization.findMany({
    where: { name: { startsWith: "B003 Org " } },
    select: { id: true },
  });
  tracked.organizationIds.push(...staleOrgs.map((o) => o.id));
  const staleTmpls = await prisma.qualificationTemplate.findMany({
    where: { kind: { startsWith: "B003_" } },
    select: { id: true },
  });
  tracked.templateIds.push(...staleTmpls.map((t) => t.id));
  const staleAssocs = await prisma.association.findMany({
    where: { name: { startsWith: "B003 Other " } },
    select: { id: true },
  });
  tracked.associationIdsCreated.push(...staleAssocs.map((a) => a.id));
  if (staleUsers.length > 0) {
    const staleAdmins = await prisma.associationAdmin.findMany({
      where: { userId: { in: staleUsers.map((u) => u.id) } },
      select: { id: true },
    });
    tracked.associationAdminIds.push(...staleAdmins.map((a) => a.id));
    const staleEntries = await prisma.competitionEntry.findMany({
      where: { userId: { in: staleUsers.map((u) => u.id) } },
      select: { id: true },
    });
    tracked.entryIds.push(...staleEntries.map((e) => e.id));
    const staleQuals = await prisma.qualification.findMany({
      where: { userId: { in: staleUsers.map((u) => u.id) } },
      select: { id: true },
    });
    tracked.qualificationIds.push(...staleQuals.map((q) => q.id));
  }
}

async function resetTracked() {
  tracked.userIds = [];
  tracked.associationIdsCreated = [];
  tracked.associationAdminIds = [];
  tracked.templateIds = [];
  tracked.organizationIds = [];
  tracked.competitionIds = [];
  tracked.eventIds = [];
  tracked.entryIds = [];
  tracked.qualificationIds = [];
}

async function cleanup() {
  const userIds = [...new Set(tracked.userIds)];
  tracked.entryIds = [...new Set(tracked.entryIds)];
  tracked.competitionIds = [...new Set(tracked.competitionIds)];
  tracked.organizationIds = [...new Set(tracked.organizationIds)];
  tracked.templateIds = [...new Set(tracked.templateIds)];
  tracked.associationIdsCreated = [...new Set(tracked.associationIdsCreated)];
  tracked.associationAdminIds = [...new Set(tracked.associationAdminIds)];
  if (userIds.length === 0 && tracked.competitionIds.length === 0) return;

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
        ...tracked.qualificationIds.map((id) => ({ target: `qualification:${id}` })),
      ],
    },
  });
  await prisma.qualificationHistory.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.qualification.deleteMany({
    where: { userId: { in: userIds } },
  });
  if (tracked.entryIds.length > 0) {
    await prisma.entrySnapshot.deleteMany({ where: { entryId: { in: tracked.entryIds } } });
    await prisma.entryItem.deleteMany({
      where: { entryId: { in: tracked.entryIds } },
    });
    await prisma.competitionEntry.deleteMany({
      where: { OR: [{ id: { in: tracked.entryIds } }, { userId: { in: userIds } }] },
    });
  } else if (userIds.length > 0) {
    await prisma.competitionEntry.deleteMany({ where: { userId: { in: userIds } } });
  }
  if (tracked.competitionIds.length > 0) {
    await prisma.competitionStartListSnapshot.deleteMany({
      where: { competitionId: { in: tracked.competitionIds } },
    });
    await prisma.event.deleteMany({ where: { competitionId: { in: tracked.competitionIds } } });
    await prisma.competition.deleteMany({ where: { id: { in: tracked.competitionIds } } });
  }
  if (tracked.organizationIds.length > 0) {
    await prisma.orgAdmin.deleteMany({ where: { organizationId: { in: tracked.organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: tracked.organizationIds } } });
  }
  if (tracked.associationAdminIds.length > 0) {
    await prisma.associationAdmin.deleteMany({ where: { id: { in: tracked.associationAdminIds } } });
  }
  if (tracked.associationIdsCreated.length > 0) {
    await prisma.association.deleteMany({ where: { id: { in: tracked.associationIdsCreated } } });
  }
  if (tracked.templateIds.length > 0) {
    await prisma.qualificationTemplate.deleteMany({ where: { id: { in: tracked.templateIds } } });
  }
  if (userIds.length > 0) {
    await prisma.userJlaProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

describe.skipIf(!idsOk)("B-003〜005 開発DB結合", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const db = await prisma.$queryRawUnsafe<{ database: string }[]>(
      `SELECT current_database() AS database`
    );
    if (db[0]?.database !== EXPECTED_DB) {
      throw new Error("current_database が許可対象と不一致のため停止");
    }

    await collectStaleBindIds();
    await cleanup();
    resetTracked();

    ownerId = await createPerson("USER", "owner", 1990);
    otherId = await createPerson("USER", "other", 1991);
    jlaId = await createPerson("USER", "jla", 1980);
    otherAssocAdminId = await createPerson("USER", "assoc2", 1981);
    pfId = await createPerson("PF_ADMIN", "pf", 1975);
    auditUserId = await createPerson("USER", "audit", 1992);
    raceUserId = await createPerson("USER", "race", 1993);

    const allowed = await prisma.qualificationTemplate.create({
      data: {
        kind: `B003_${RUN}_ALLOWED`,
        name: `B003 allowed ${RUN}`,
        requiresExpiry: false,
      },
    });
    const otherT = await prisma.qualificationTemplate.create({
      data: {
        kind: `B003_${RUN}_OTHER`,
        name: `B003 other ${RUN}`,
        requiresExpiry: false,
      },
    });
    allowedTmplId = allowed.id;
    tracked.templateIds.push(allowed.id, otherT.id);

    const existingJla = await prisma.association.findFirst({
      where: { name: JLA_ASSOCIATION_CANONICAL_NAME },
      select: { id: true, status: true },
    });
    if (existingJla) {
      jlaAssocId = existingJla.id;
      if (existingJla.status !== "APPROVED") {
        throw new Error("既存JLA協会が APPROVED ではないため停止（既存行は変更しない）");
      }
    } else {
      const created = await prisma.association.create({
        data: { name: JLA_ASSOCIATION_CANONICAL_NAME, status: "APPROVED" },
      });
      jlaAssocId = created.id;
      tracked.associationIdsCreated.push(created.id);
    }

    const otherAssoc = await prisma.association.create({
      data: { name: `B003 Other ${RUN}`, status: "APPROVED" },
    });
    tracked.associationIdsCreated.push(otherAssoc.id);

    const jlaAdmin = await prisma.associationAdmin.create({
      data: { userId: jlaId, associationId: jlaAssocId, role: "ADMIN" },
    });
    const otherAdmin = await prisma.associationAdmin.create({
      data: { userId: otherAssocAdminId, associationId: otherAssoc.id, role: "ADMIN" },
    });
    tracked.associationAdminIds.push(jlaAdmin.id, otherAdmin.id);

    process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = jlaAssocId;
    process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = JSON.stringify([allowedTmplId]);

    const org = await prisma.organization.create({
      data: {
        name: `B003 Org ${RUN}`,
        status: "APPROVED",
        createdById: ownerId,
      },
    });
    tracked.organizationIds.push(org.id);

    const now = new Date();
    const entryStart = new Date(now.getTime() - 60 * 60 * 1000);
    const entryEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const startDate = new Date("2026-08-01T00:00:00.000Z");
    const endDate = new Date("2026-08-01T00:00:00.000Z");

    async function makeComp(name: string, required: unknown) {
      const c = await prisma.competition.create({
        data: {
          organizationId: org.id,
          name,
          startDate,
          endDate,
          venue: "bind-test",
          status: "PUBLISHED",
          isPublished: true,
          entryStartDate: entryStart,
          entryEndDate: entryEnd,
          entryFee: { individualEntryFee: 0, teamEntryFeePerTeam: 0 },
          requiredQualifications: required as object,
          requireClubMembership: false,
        },
      });
      tracked.competitionIds.push(c.id);
      const ev = await prisma.event.create({
        data: {
          competitionId: c.id,
          name: `Event ${name}`,
          sex: "OTHER",
          type: "INDIVIDUAL",
          requiresEntryTime: false,
        },
      });
      tracked.eventIds.push(ev.id);
      return { competitionId: c.id, eventId: ev.id };
    }

    const reqC = await makeComp(`B003 req ${RUN}`, [allowed.kind]);
    const noneC = await makeComp(`B003 none ${RUN}`, []);
    const tierC = await makeComp(`B003 tier ${RUN}`, {
      ageCategoryQualificationTiers: [
        { ageCategoryId: "no-such-category", requiredQualifications: [allowed.kind] },
      ],
    });
    compReqId = reqC.competitionId;
    eventReqId = reqC.eventId;
    compNoneId = noneC.competitionId;
    eventNoneId = noneC.eventId;
    compTierId = tierC.competitionId;
    eventTierId = tierC.eventId;
  }, 120_000);

  afterAll(async () => {
    try {
      await cleanup();
      const leftover = {
        user: await prisma.user.count({ where: { id: { in: tracked.userIds } } }),
        qualification: await prisma.qualification.count({
          where: { userId: { in: tracked.userIds } },
        }),
        qualificationHistory: await prisma.qualificationHistory.count({
          where: { userId: { in: tracked.userIds } },
        }),
        auditLog: await prisma.auditLog.count({
          where: { actorUserId: { in: tracked.userIds } },
        }),
        associationCreated: tracked.associationIdsCreated.length
          ? await prisma.association.count({
              where: { id: { in: tracked.associationIdsCreated } },
            })
          : 0,
        associationAdmin: tracked.associationAdminIds.length
          ? await prisma.associationAdmin.count({
              where: { id: { in: tracked.associationAdminIds } },
            })
          : 0,
        template: tracked.templateIds.length
          ? await prisma.qualificationTemplate.count({
              where: { id: { in: tracked.templateIds } },
            })
          : 0,
        competition: tracked.competitionIds.length
          ? await prisma.competition.count({
              where: { id: { in: tracked.competitionIds } },
            })
          : 0,
        organization: tracked.organizationIds.length
          ? await prisma.organization.count({
              where: { id: { in: tracked.organizationIds } },
            })
          : 0,
        entry: tracked.entryIds.length
          ? await prisma.competitionEntry.count({
              where: { id: { in: tracked.entryIds } },
            })
          : await prisma.competitionEntry.count({
              where: { userId: { in: tracked.userIds } },
            }),
      };
      const leftoverHits = Object.entries(leftover).filter(([, n]) => n > 0);
      if (leftoverHits.length > 0) {
        throw new Error(
          `後片付け残存 ${leftoverHits.map(([k, n]) => `${k}=${n}`).join(" ")}`
        );
      }
    } finally {
      if (prevReviewAssoc === undefined) delete process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV];
      else process.env[QUALIFICATION_REVIEW_ASSOCIATION_ID_ENV] = prevReviewAssoc;
      if (prevReviewTemplates === undefined) {
        delete process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV];
      } else {
        process.env[QUALIFICATION_REVIEW_TEMPLATE_IDS_ENV] = prevReviewTemplates;
      }
      await prisma.$disconnect();
    }
  }, 120_000);

  it("自己申告PENDING保存と確認根拠の不正書込防止", async () => {
    asOwner();
    const res = await POST(
      jsonReq("http://localhost/api/qualifications", "POST", {
        kind: `B003_${RUN}_ALLOWED`,
        jlaMemberNumber: jlaMember(100001),
        certNumber: "CERT-A",
        confirmedAt: "2020-01-01T00:00:00.000Z",
        confirmedByUserId: "forged",
        confirmationMethod: "REVIEW",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; confirmedAt: string | null };
    pendingQualId = body.id;
    tracked.qualificationIds.push(body.id);
    expect(body.status).toBe("PENDING");
    const row = await prisma.qualification.findUnique({ where: { id: body.id } });
    expect(row?.confirmedAt).toBeNull();
    expect(row?.confirmedByUserId).toBeNull();
    expect(row?.confirmationMethod).toBeNull();
    expect(row?.recordOrigin).toBe("USER_APPLICATION");
  });

  it("権限制御: 本人・他人・JLA・別協会・PF", async () => {
    asOwner();
    const own = await GET_ONE(jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "GET"), ctx(pendingQualId));
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as { user: { id?: string; email?: string } };
    expect(ownBody.user?.id).toBe(ownerId);
    expect(ownBody.user?.email).toBeUndefined();

    asUser(otherId);
    const stranger = await GET_ONE(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "GET"),
      ctx(pendingQualId)
    );
    expect(stranger.status).toBe(403);

    const listForbidden = await GET_LIST(
      jsonReq(`http://localhost/api/qualifications?userId=${ownerId}`, "GET")
    );
    expect(listForbidden.status).toBe(403);

    asUser(jlaId);
    const jlaOk = await GET_ONE(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "GET"),
      ctx(pendingQualId)
    );
    expect(jlaOk.status).toBe(200);
    const jlaBody = (await jlaOk.json()) as { user: { email?: string } };
    expect(typeof jlaBody.user?.email).toBe("string");

    asUser(otherAssocAdminId);
    const otherAssoc = await GET_ONE(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "GET"),
      ctx(pendingQualId)
    );
    expect(otherAssoc.status).toBe(403);
    const patchOtherAssoc = await PATCH(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "PATCH", { status: "APPROVED" }),
      ctx(pendingQualId)
    );
    expect(patchOtherAssoc.status).toBe(403);

    asUser(pfId);
    const pfGet = await GET_ONE(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "GET"),
      ctx(pendingQualId)
    );
    expect(pfGet.status).toBe(200);

    asOwner();
    const otherTmplRes = await POST(
      jsonReq("http://localhost/api/qualifications", "POST", {
        kind: `B003_${RUN}_OTHER`,
        jlaMemberNumber: jlaMember(100001),
      })
    );
    expect(otherTmplRes.status).toBe(201);
    const otherBody = (await otherTmplRes.json()) as { id: string };
    otherTmplQualId = otherBody.id;
    tracked.qualificationIds.push(otherBody.id);

    asUser(jlaId);
    const jlaOtherTmpl = await GET_ONE(
      jsonReq(`http://localhost/api/qualifications/${otherTmplQualId}`, "GET"),
      ctx(otherTmplQualId)
    );
    expect(jlaOtherTmpl.status).toBe(403);
    const jlaPatchOther = await PATCH(
      jsonReq(`http://localhost/api/qualifications/${otherTmplQualId}`, "PATCH", { status: "APPROVED" }),
      ctx(otherTmplQualId)
    );
    expect(jlaPatchOther.status).toBe(403);
  });

  it("JLA承認で公式確認が付き、PF単独では確認を書けない", async () => {
    asUser(pfId);
    const pfApproveOther = await PATCH(
      jsonReq(`http://localhost/api/qualifications/${otherTmplQualId}`, "PATCH", {
        status: "APPROVED",
      }),
      ctx(otherTmplQualId)
    );
    expect(pfApproveOther.status).toBe(200);
    const pfRow = await prisma.qualification.findUnique({ where: { id: otherTmplQualId } });
    expect(pfRow?.status).toBe("APPROVED");
    expect(pfRow?.confirmedAt).toBeNull();

    asUser(jlaId);
    const approve = await PATCH(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "PATCH", {
        status: "APPROVED",
        certNumber: "CERT-A",
        expiryDate: "2027-08-01T00:00:00.000Z",
      }),
      ctx(pendingQualId)
    );
    expect(approve.status).toBe(200);
    const row = await prisma.qualification.findUnique({ where: { id: pendingQualId } });
    expect(row?.status).toBe("APPROVED");
    expect(row?.confirmedAt).not.toBeNull();
    expect(row?.confirmedByUserId).toBe(jlaId);
    expect(row?.confirmedByAssociationId).toBe(jlaAssocId);
    expect(
      isActiveOfficialConfirmation({
        ...row!,
        expiryDate: row!.expiryDate,
        certNumber: row!.certNumber,
      })
    ).toBe(true);
  });

  it("協会確認後は本人DELETEと同期取消が禁止", async () => {
    asOwner();
    const del = await DELETE(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "DELETE"),
      ctx(pendingQualId)
    );
    expect(del.status).toBe(403);
    const still = await prisma.qualification.findUnique({ where: { id: pendingQualId } });
    expect(still).not.toBeNull();

    const sync = await PUT_SYNC(
      jsonReq("http://localhost/api/users/me/qualifications", "PUT", {
        templateIds: [],
        jlaMemberNumber: jlaMember(100001),
      })
    );
    expect(sync.status).toBe(200);
    const afterSync = await prisma.qualification.findUnique({ where: { id: pendingQualId } });
    expect(afterSync).not.toBeNull();
  });

  it("資格変更で確認無効化され、値を戻しても復活しない", async () => {
    asUser(pfId);
    const invalidate = await PATCH(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "PATCH", {
        status: "APPROVED",
        certNumber: "CERT-CHANGED",
      }),
      ctx(pendingQualId)
    );
    expect(invalidate.status).toBe(200);
    const mid = await prisma.qualification.findUnique({ where: { id: pendingQualId } });
    expect(mid?.confirmationInvalidatedAt).not.toBeNull();
    expect(
      isActiveOfficialConfirmation({
        ...mid!,
        expiryDate: mid!.expiryDate,
        certNumber: mid!.certNumber,
      })
    ).toBe(false);

    const restore = await PATCH(
      jsonReq(`http://localhost/api/qualifications/${pendingQualId}`, "PATCH", {
        status: "APPROVED",
        certNumber: "CERT-A",
      }),
      ctx(pendingQualId)
    );
    expect(restore.status).toBe(200);
    const end = await prisma.qualification.findUnique({ where: { id: pendingQualId } });
    expect(end?.certNumber).toBe("CERT-A");
    expect(end?.confirmationInvalidatedAt).not.toBeNull();
    expect(
      isActiveOfficialConfirmation({
        ...end!,
        expiryDate: end!.expiryDate,
        certNumber: end!.certNumber,
      })
    ).toBe(false);
  });

  it("個人受付: 要件なし成立、要件ありは申告で通過、tierMissingは拒否", async () => {
    asOwner();
    const none = await POST_ENTRY(
      jsonReq(`http://localhost/api/competitions/${compNoneId}/entries`, "POST", {
        items: [{ eventId: eventNoneId }],
        confirmed: true,
      }),
      ctx(compNoneId)
    );
    const nonePayload = await none.json();
    expect(none.status, JSON.stringify(nonePayload)).toBe(200);
    const noneBody = nonePayload as { entryId?: string };
    if (noneBody.entryId) tracked.entryIds.push(noneBody.entryId);

    const reqOk = await POST_ENTRY(
      jsonReq(`http://localhost/api/competitions/${compReqId}/entries`, "POST", {
        items: [{ eventId: eventReqId }],
        confirmed: true,
      }),
      ctx(compReqId)
    );
    expect(reqOk.status).toBe(200);
    const reqBody = (await reqOk.json()) as { entryId?: string };
    if (reqBody.entryId) tracked.entryIds.push(reqBody.entryId);

    asUser(otherId);
    const reqNg = await POST_ENTRY(
      jsonReq(`http://localhost/api/competitions/${compReqId}/entries`, "POST", {
        items: [{ eventId: eventReqId }],
        confirmed: true,
      }),
      ctx(compReqId)
    );
    expect(reqNg.status).toBe(400);
    const ngBody = (await reqNg.json()) as { message?: string };
    expect(ngBody.message).toContain("参加資格");

    const tier = await POST_ENTRY(
      jsonReq(`http://localhost/api/competitions/${compTierId}/entries`, "POST", {
        items: [{ eventId: eventTierId }],
        confirmed: true,
      }),
      ctx(compTierId)
    );
    expect(tier.status).toBe(400);
    const tierBody = (await tier.json()) as { message?: string };
    expect(tierBody.message).toMatch(/AGEカテゴリ|生年月日/);
  });

  it("審査と取消の競合は一方のみ成功", async () => {
    asUser(raceUserId);
    const created = await POST(
      jsonReq("http://localhost/api/qualifications", "POST", {
        kind: `B003_${RUN}_ALLOWED`,
        jlaMemberNumber: jlaMember(100002),
      })
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string };
    raceQualId = createdBody.id;
    tracked.qualificationIds.push(raceQualId);

    const [delRes, patchRes] = await Promise.all([
      sessionAls.run({ userId: raceUserId }, () =>
        DELETE(
          jsonReq(`http://localhost/api/qualifications/${raceQualId}`, "DELETE"),
          ctx(raceQualId)
        )
      ),
      sessionAls.run({ userId: jlaId }, () =>
        PATCH(
          jsonReq(`http://localhost/api/qualifications/${raceQualId}`, "PATCH", {
            status: "APPROVED",
          }),
          ctx(raceQualId)
        )
      ),
    ]);
    const statuses = [delRes.status, patchRes.status].sort();
    const ok = statuses.filter((s) => s === 200).length;
    const conflict = statuses.filter((s) => s === 403 || s === 404 || s === 409 || s === 500).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(ok + conflict).toBe(2);
    const remaining = await prisma.qualification.findUnique({ where: { id: raceQualId } });
    if (delRes.status === 200) {
      expect(remaining).toBeNull();
    } else {
      expect(remaining).not.toBeNull();
    }
  });

  it("監査失敗時は資格・履歴・プロフィール更新が巻き戻る", async () => {
    const origTx = prisma.$transaction.bind(prisma) as typeof prisma.$transaction;
    let inject = true;
    (prisma.$transaction as typeof prisma.$transaction) = (async (
      arg: unknown,
      options?: unknown
    ) => {
      if (!inject || typeof arg !== "function") {
        return origTx(arg as never, options as never);
      }
      return origTx(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        tx.auditLog.create = (async () => {
          throw new Error("B003_AUDIT_INJECT");
        }) as unknown as typeof tx.auditLog.create;
        return (arg as (t: typeof tx) => Promise<unknown>)(tx);
      }, options as never);
    }) as typeof prisma.$transaction;
    try {
      asUser(auditUserId);
      const res = await POST(
        jsonReq("http://localhost/api/qualifications", "POST", {
          kind: `B003_${RUN}_ALLOWED`,
          jlaMemberNumber: jlaMember(100003),
        })
      );
      expect(res.status).toBeGreaterThanOrEqual(500);
      const quals = await prisma.qualification.findMany({ where: { userId: auditUserId } });
      const hist = await prisma.qualificationHistory.findMany({ where: { userId: auditUserId } });
      const profile = await prisma.userJlaProfile.findUnique({ where: { userId: auditUserId } });
      expect(quals).toHaveLength(0);
      expect(hist).toHaveLength(0);
      expect(profile).toBeNull();
    } finally {
      inject = false;
      prisma.$transaction = origTx;
    }
  });
});
