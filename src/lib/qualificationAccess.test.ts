import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildQualificationListPermissionWhere,
  buildQualificationPatchConcurrencyWhere,
  canPatchQualificationRecord,
  canViewQualificationAsReviewer,
  jlaAdminPendingFindManyArgs,
  jlaAdminPendingQueueWhere,
  mapJlaAdminQueueRowToTableUser,
  qualificationAdminQueueUserSelectForJla,
  qualificationHolderForViewer,
  resolveQualificationViewerKind,
  type QualificationAccessContext,
} from "./qualificationAccess";
import {
  buildOwnerPendingSelfUpdateWhere,
  buildOwnerQualificationCancelManyWhere,
  buildOwnerQualificationCancelWhere,
  buildOwnerQualificationPersistTemplateIds,
  canOwnerPhysicallyDeleteQualification,
  isQualificationBlockedFromOwnerAdd,
  isQualificationHeldForPrerequisite,
  mapOwnerQualificationSelectionUi,
  ownerQualificationDeselectLock,
  partitionQualificationsForOwnerSync,
  QUALIFICATION_BLOCKED_FROM_OWNER_ADD_ERROR,
  selectedBlockedFromOwnerAddTemplateIds,
} from "./qualificationOwnerRules";

const HOLDER = {
  id: "user-owner",
  email: "owner@example.test",
  profile: { familyName: "山田", givenName: "太郎" },
};

const ALLOWED = "tmpl_jla_fixture_1";
const OTHER_TMPL = "tmpl_other_fixture";

const pfAccess: QualificationAccessContext = {
  isPfAdmin: true,
  isJlaReviewer: false,
  reviewAssociationId: null,
  reviewTemplateIds: [],
};

const jlaAccess: QualificationAccessContext = {
  isPfAdmin: false,
  isJlaReviewer: true,
  reviewAssociationId: "assoc_jla_fixture_1",
  reviewTemplateIds: [ALLOWED],
};

const userAccess: QualificationAccessContext = {
  isPfAdmin: false,
  isJlaReviewer: false,
  reviewAssociationId: null,
  reviewTemplateIds: [],
};

describe("resolveQualificationViewerKind", () => {
  it("本人は owner", () => {
    expect(
      resolveQualificationViewerKind({
        viewerUserId: "user-owner",
        holderUserId: "user-owner",
        isReviewer: false,
      })
    ).toBe("owner");
  });

  it("レコード審査者は reviewer（本人でも reviewer を優先）", () => {
    expect(
      resolveQualificationViewerKind({
        viewerUserId: "user-owner",
        holderUserId: "user-owner",
        isReviewer: true,
      })
    ).toBe("reviewer");
  });

  it("協会管理者の肩書きだけでは reviewer にならない", () => {
    expect(canViewQualificationAsReviewer(userAccess, ALLOWED)).toBe(false);
    expect(
      resolveQualificationViewerKind({
        viewerUserId: "assoc-admin-a",
        holderUserId: "user-owner",
        isReviewer: canViewQualificationAsReviewer(userAccess, ALLOWED),
      })
    ).toBeNull();
  });

  it("無関係ユーザーは null", () => {
    expect(
      resolveQualificationViewerKind({
        viewerUserId: "user-other",
        holderUserId: "user-owner",
        isReviewer: false,
      })
    ).toBeNull();
  });
});

describe("canViewQualificationAsReviewer / canPatchQualificationRecord", () => {
  it("PF は許可リスト外でも審査・PATCH 可", () => {
    expect(canViewQualificationAsReviewer(pfAccess, OTHER_TMPL)).toBe(true);
    expect(canPatchQualificationRecord(pfAccess, OTHER_TMPL)).toBe(true);
  });

  it("JLA 審査者は許可リスト内のみ", () => {
    expect(canViewQualificationAsReviewer(jlaAccess, ALLOWED)).toBe(true);
    expect(canViewQualificationAsReviewer(jlaAccess, OTHER_TMPL)).toBe(false);
    expect(canPatchQualificationRecord(jlaAccess, OTHER_TMPL)).toBe(false);
  });
});

describe("buildQualificationListPermissionWhere", () => {
  it("一般ユーザーの他人 userId は forbidden", () => {
    expect(
      buildQualificationListPermissionWhere({
        viewerUserId: "user-owner",
        access: userAccess,
        requestedUserId: "user-other",
        kind: null,
        status: null,
      })
    ).toBe("forbidden");
  });

  it("JLA の一覧条件は本人 OR 許可 templateId で、query は権限を置き換えない", () => {
    const where = buildQualificationListPermissionWhere({
      viewerUserId: "jla-admin",
      access: jlaAccess,
      requestedUserId: "user-other",
      kind: "BLS・WS",
      status: "PENDING",
    });
    expect(where).not.toBe("forbidden");
    expect(where).toEqual({
      AND: [
        { kind: "BLS・WS" },
        { status: "PENDING" },
        { userId: "user-other" },
        {
          OR: [{ userId: "jla-admin" }, { templateId: { in: [ALLOWED] } }],
        },
      ],
    });
  });

  it("findMany と count に同じ where を使える", () => {
    const where = buildQualificationListPermissionWhere({
      viewerUserId: "jla-admin",
      access: jlaAccess,
      requestedUserId: null,
      kind: null,
      status: null,
    });
    const countWhere = buildQualificationListPermissionWhere({
      viewerUserId: "jla-admin",
      access: jlaAccess,
      requestedUserId: null,
      kind: null,
      status: null,
    });
    expect(where).toEqual(countWhere);
  });
});

describe("jlaAdminPendingQueueWhere", () => {
  it("PENDING かつ許可 templateId のみ", () => {
    expect(jlaAdminPendingQueueWhere(jlaAccess)).toEqual({
      status: "PENDING",
      templateId: { in: [ALLOWED] },
    });
  });
});

describe("jlaAdminPendingFindManyArgs / mapJlaAdminQueueRowToTableUser", () => {
  it("JLA 管理画面 query は許可 templateId と PENDING に限定し、select に電話がない", () => {
    const args = jlaAdminPendingFindManyArgs(jlaAccess);
    expect(args.where).toEqual({
      status: "PENDING",
      templateId: { in: [ALLOWED] },
    });
    expect(args.include.user.select).toEqual(qualificationAdminQueueUserSelectForJla);
    expect(JSON.stringify(args.include.user.select)).not.toMatch(/phone/i);
    expect(args.include.user.select).not.toHaveProperty("contact");
  });

  it("JLA クライアント props に phoneNumber を含めない", () => {
    const user = mapJlaAdminQueueRowToTableUser({
      id: "u1",
      email: "a@example.test",
      profile: { familyName: "山", givenName: "田" },
    });
    expect(user).toEqual({
      id: "u1",
      email: "a@example.test",
      familyName: "山",
      givenName: "田",
    });
    expect(user).not.toHaveProperty("phoneNumber");
  });
});

describe("buildQualificationPatchConcurrencyWhere", () => {
  const updatedAt = new Date("2026-01-01T00:00:00.000Z");

  it("読取時の id/userId/templateId/updatedAt を条件にする", () => {
    expect(
      buildQualificationPatchConcurrencyWhere({
        id: "q1",
        userId: "owner",
        templateId: ALLOWED,
        updatedAt,
        isPfAdmin: true,
        reviewTemplateIds: [],
      })
    ).toEqual({
      id: "q1",
      userId: "owner",
      templateId: ALLOWED,
      updatedAt,
    });
  });

  it("JLA は許可リスト条件を AND する", () => {
    expect(
      buildQualificationPatchConcurrencyWhere({
        id: "q1",
        userId: "owner",
        templateId: ALLOWED,
        updatedAt,
        isPfAdmin: false,
        reviewTemplateIds: [ALLOWED],
      })
    ).toEqual({
      AND: [
        {
          id: "q1",
          userId: "owner",
          templateId: ALLOWED,
          updatedAt,
        },
        { templateId: { in: [ALLOWED] } },
      ],
    });
  });
});

describe("canOwnerPhysicallyDeleteQualification", () => {
  it("USER_APPLICATION かつ PENDING のみ本人取消可", () => {
    expect(
      canOwnerPhysicallyDeleteQualification({
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
      })
    ).toBe(true);
    expect(
      canOwnerPhysicallyDeleteQualification({
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
        confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
    ).toBe(false);
  });

  it("本人の APPROVED は取消不可", () => {
    expect(
      canOwnerPhysicallyDeleteQualification({
        recordOrigin: "USER_APPLICATION",
        status: "APPROVED",
      })
    ).toBe(false);
  });

  it("ASSOCIATION_IMPORT は状態を問わず本人取消不可", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const) {
      expect(
        canOwnerPhysicallyDeleteQualification({
          recordOrigin: "ASSOCIATION_IMPORT",
          status,
        })
      ).toBe(false);
    }
  });

  it("REJECTED / EXPIRED の自己申告は物理削除しない", () => {
    expect(
      canOwnerPhysicallyDeleteQualification({
        recordOrigin: "USER_APPLICATION",
        status: "REJECTED",
      })
    ).toBe(false);
    expect(
      canOwnerPhysicallyDeleteQualification({
        recordOrigin: "USER_APPLICATION",
        status: "EXPIRED",
      })
    ).toBe(false);
  });
});

describe("ownerQualificationDeselectLock", () => {
  it("協会取込は公式ロック", () => {
    expect(
      ownerQualificationDeselectLock({
        recordOrigin: "ASSOCIATION_IMPORT",
        status: "PENDING",
      })
    ).toBe("official_import");
  });

  it("承認済み自己申告は解除不可", () => {
    expect(
      ownerQualificationDeselectLock({
        recordOrigin: "USER_APPLICATION",
        status: "APPROVED",
      })
    ).toBe("not_cancellable");
  });

  it("申請中の自己申告はロックしない", () => {
    expect(
      ownerQualificationDeselectLock({
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
      })
    ).toBeNull();
    expect(
      ownerQualificationDeselectLock({
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
        confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
    ).toBe("not_cancellable");
  });
});

describe("partitionQualificationsForOwnerSync", () => {
  const rows = [
    {
      id: "q-pending",
      templateId: "tmpl-pending",
      kind: "P",
      status: "PENDING",
      recordOrigin: "USER_APPLICATION",
    },
    {
      id: "q-approved",
      templateId: "tmpl-approved",
      kind: "A",
      status: "APPROVED",
      recordOrigin: "USER_APPLICATION",
    },
    {
      id: "q-rejected",
      templateId: "tmpl-rejected",
      kind: "R",
      status: "REJECTED",
      recordOrigin: "USER_APPLICATION",
    },
    {
      id: "q-expired",
      templateId: "tmpl-expired",
      kind: "E",
      status: "EXPIRED",
      recordOrigin: "USER_APPLICATION",
    },
  ] as const;

  it("全状態を占有枠にし、保有と取消可能と追加不可を分ける", () => {
    const partitioned = partitionQualificationsForOwnerSync(rows, (row) => row.templateId);
    expect([...partitioned.occupancyTemplateIds].sort()).toEqual(
      ["tmpl-approved", "tmpl-expired", "tmpl-pending", "tmpl-rejected"].sort()
    );
    expect(partitioned.heldForPrerequisite.map((q) => q.id)).toEqual(["q-pending", "q-approved"]);
    expect(partitioned.cancellable.map((q) => q.id)).toEqual(["q-pending"]);
    expect([...partitioned.blockedFromAddTemplateIds].sort()).toEqual(
      ["tmpl-expired", "tmpl-rejected"].sort()
    );
    expect(isQualificationHeldForPrerequisite({ status: "REJECTED" })).toBe(false);
    expect(isQualificationBlockedFromOwnerAdd({ status: "EXPIRED" })).toBe(true);
  });

  it("却下・期限切れを選択したら追加不可として検出する", () => {
    const partitioned = partitionQualificationsForOwnerSync(rows, (row) => row.templateId);
    expect(
      selectedBlockedFromOwnerAddTemplateIds(
        ["tmpl-rejected", "tmpl-pending"],
        partitioned.blockedFromAddTemplateIds
      )
    ).toEqual(["tmpl-rejected"]);
  });
});

describe("mapOwnerQualificationSelectionUi / persist", () => {
  it("却下・期限切れは追加対象にも保有チェックにも入れない", () => {
    const ui = mapOwnerQualificationSelectionUi([
      { templateId: "tmpl-pending", recordOrigin: "USER_APPLICATION", status: "PENDING" },
      { templateId: "tmpl-approved", recordOrigin: "USER_APPLICATION", status: "APPROVED" },
      { templateId: "tmpl-rejected", recordOrigin: "USER_APPLICATION", status: "REJECTED" },
      { templateId: "tmpl-expired", recordOrigin: "ASSOCIATION_IMPORT", status: "EXPIRED" },
    ]);
    expect(ui.linkedTemplateIds).toEqual(["tmpl-pending", "tmpl-approved"]);
    expect(ui.blockedFromAddTemplateIds).toEqual(["tmpl-rejected", "tmpl-expired"]);
    expect(ui.lockedTemplateIds).toEqual(["tmpl-approved"]);
  });

  it("追加不可を含む保存は blockedSelected になり成功扱いにしない", () => {
    const persist = buildOwnerQualificationPersistTemplateIds({
      checkedTemplateIds: ["tmpl-rejected", "tmpl-new"],
      lockedTemplateIds: [],
      blockedFromAddTemplateIds: ["tmpl-rejected"],
    });
    expect(persist.blockedSelected).toBe(true);
    expect(persist.templateIds).toEqual(["tmpl-new"]);
    expect(QUALIFICATION_BLOCKED_FROM_OWNER_ADD_ERROR).toContain("却下または期限切れ");
  });
});

describe("buildOwnerQualificationCancelWhere", () => {
  it("削除条件に所有者・出所・状態を含める", () => {
    expect(buildOwnerQualificationCancelWhere({ id: "q1", userId: "owner" })).toEqual({
      id: "q1",
      userId: "owner",
      recordOrigin: "USER_APPLICATION",
      status: "PENDING",
      confirmedAt: null,
    });
    expect(buildOwnerQualificationCancelManyWhere({ ids: ["q1", "q2"], userId: "owner" })).toEqual({
      id: { in: ["q1", "q2"] },
      userId: "owner",
      recordOrigin: "USER_APPLICATION",
      status: "PENDING",
      confirmedAt: null,
    });
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    expect(
      buildOwnerPendingSelfUpdateWhere({
        id: "q1",
        userId: "owner",
        templateId: ALLOWED,
        updatedAt,
      })
    ).toEqual({
      id: "q1",
      userId: "owner",
      templateId: ALLOWED,
      recordOrigin: "USER_APPLICATION",
      status: "PENDING",
      confirmedAt: null,
      updatedAt,
    });
  });
});

describe("qualificationHolderForViewer", () => {
  it("本人には id のみ（メールを載せない）", () => {
    const payload = qualificationHolderForViewer(HOLDER, "owner");
    expect(payload).toEqual({ id: "user-owner" });
    expect(payload).not.toHaveProperty("email");
    expect(JSON.stringify(payload)).not.toContain("@");
  });

  it("審査者には氏名とメール（電話は含めない）", () => {
    const payload = qualificationHolderForViewer(HOLDER, "reviewer");
    expect(payload).toEqual({
      id: "user-owner",
      email: "owner@example.test",
      profile: { familyName: "山田", givenName: "太郎" },
    });
    expect(JSON.stringify(payload)).not.toMatch(/phone/i);
  });
});

describe("qualificationOwnerRules の依存", () => {
  it("共有ファイルとクライアントは DB・認証・審査設定を import しない", () => {
    const rules = readFileSync(
      path.join(process.cwd(), "src/lib/qualificationOwnerRules.ts"),
      "utf8"
    );
    const client = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(authenticated)/qualifications/QualificationsSelectionClient.tsx"
      ),
      "utf8"
    );
    for (const src of [rules, client]) {
      expect(src).not.toMatch(/@\/server\/db/);
      expect(src).not.toMatch(/qualificationReviewConfig/);
      expect(src).not.toMatch(/@\/lib\/auth/);
      expect(src).not.toMatch(/from ["']@prisma\/client["']/);
    }
    expect(client).not.toMatch(/qualificationAccess/);
    expect(client).toMatch(/qualificationOwnerRules/);
    expect(rules).not.toMatch(/^import (?!type )/m);
  });
});
