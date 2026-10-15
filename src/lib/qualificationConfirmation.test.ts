import { describe, expect, it } from "vitest";
import { canWriteOfficialQualificationConfirmation } from "./qualificationAccess";
import {
  buildConfirmationMutation,
  canOwnerPhysicallyDeleteQualification,
  confirmationSnapshotMatchesHeldFields,
  hasCompleteOfficialConfirmationActors,
  hasConfirmationEvidence,
  isActiveOfficialConfirmation,
  ownerQualificationDeselectLock,
  QUALIFICATION_CONFIRMATION_METHOD_REVIEW,
  shouldInvalidateActiveConfirmation,
} from "./qualificationOwnerRules";

const snapshot = {
  status: "APPROVED" as const,
  templateId: "tmpl_jla_fixture_1",
  certNumber: "C-1",
  expiryDate: new Date("2027-01-01T00:00:00.000Z") as Date | null,
  confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
  confirmationInvalidatedAt: null as Date | null,
  confirmedTemplateId: "tmpl_jla_fixture_1",
  confirmedCertNumber: "C-1",
  confirmedExpiryDate: new Date("2027-01-01T00:00:00.000Z") as Date | null,
  confirmedByUserId: "jla-admin",
  confirmedByAssociationId: "assoc_jla_fixture_1",
  confirmationMethod: QUALIFICATION_CONFIRMATION_METHOD_REVIEW,
};

describe("canWriteOfficialQualificationConfirmation", () => {
  const jla = {
    isPfAdmin: false,
    isJlaReviewer: true,
    reviewAssociationId: "assoc_jla_fixture_1",
    reviewTemplateIds: ["tmpl_jla_fixture_1"],
  };
  const pfOnly = {
    isPfAdmin: true,
    isJlaReviewer: false,
    reviewAssociationId: null,
    reviewTemplateIds: [] as string[],
  };
  const pfAndJla = {
    isPfAdmin: true,
    isJlaReviewer: true,
    reviewAssociationId: "assoc_jla_fixture_1",
    reviewTemplateIds: ["tmpl_jla_fixture_1"],
  };

  it("PF 権限だけでは公式確認を書けない", () => {
    expect(canWriteOfficialQualificationConfirmation(pfOnly, "tmpl_jla_fixture_1")).toBe(false);
  });

  it("PF 兼 JLA でも協会・役割・template を独立に満たす必要がある", () => {
    expect(canWriteOfficialQualificationConfirmation(pfAndJla, "tmpl_jla_fixture_1")).toBe(true);
    expect(canWriteOfficialQualificationConfirmation(pfAndJla, "tmpl_other")).toBe(false);
    expect(
      canWriteOfficialQualificationConfirmation(
        { ...pfAndJla, isJlaReviewer: false, reviewAssociationId: null },
        "tmpl_jla_fixture_1"
      )
    ).toBe(false);
    expect(
      canWriteOfficialQualificationConfirmation(
        { ...jla, reviewAssociationId: null },
        "tmpl_jla_fixture_1"
      )
    ).toBe(false);
  });
});

describe("isActiveOfficialConfirmation", () => {
  it("完全な根拠・スナップショット一致・APPROVED・未無効化のみ保有確認とする", () => {
    expect(isActiveOfficialConfirmation(snapshot)).toBe(true);
  });

  it("確認主体・操作者・方式が欠けたら公式確認にしない", () => {
    expect(
      hasCompleteOfficialConfirmationActors({ ...snapshot, confirmedByAssociationId: null })
    ).toBe(false);
    expect(isActiveOfficialConfirmation({ ...snapshot, confirmedByAssociationId: null })).toBe(false);
    expect(isActiveOfficialConfirmation({ ...snapshot, confirmedByUserId: "  " })).toBe(false);
    expect(isActiveOfficialConfirmation({ ...snapshot, confirmationMethod: null })).toBe(false);
  });

  it("スナップショットが現行値と不一致なら公式確認にしない", () => {
    expect(
      confirmationSnapshotMatchesHeldFields({
        ...snapshot,
        confirmedCertNumber: "OTHER",
      })
    ).toBe(false);
    expect(isActiveOfficialConfirmation({ ...snapshot, confirmedTemplateId: "other" })).toBe(false);
    expect(isActiveOfficialConfirmation({ ...snapshot, confirmedCertNumber: "OTHER" })).toBe(false);
    expect(
      isActiveOfficialConfirmation({
        ...snapshot,
        confirmedExpiryDate: new Date("2028-01-01T00:00:00.000Z"),
      })
    ).toBe(false);
  });

  it("PENDING や無効化済みは保有の公式確認にしない", () => {
    expect(isActiveOfficialConfirmation({ ...snapshot, status: "PENDING" })).toBe(false);
    expect(
      isActiveOfficialConfirmation({
        ...snapshot,
        confirmationInvalidatedAt: new Date("2026-02-01T00:00:00.000Z"),
      })
    ).toBe(false);
  });
});

describe("buildConfirmationMutation", () => {
  const now = new Date("2026-03-01T00:00:00.000Z");

  it("JLA 承認は公式確認スナップショットを書く", () => {
    const write = buildConfirmationMutation({
      current: { ...snapshot, status: "PENDING", confirmedAt: null },
      nextStatus: "APPROVED",
      nextTemplateId: snapshot.templateId,
      nextCertNumber: snapshot.certNumber,
      nextExpiryDate: snapshot.expiryDate,
      canWriteOfficialConfirmation: true,
      actorUserId: "jla-admin",
      associationId: "assoc_jla_fixture_1",
      now,
    });
    expect(write).toMatchObject({
      confirmedAt: now,
      confirmedByUserId: "jla-admin",
      confirmedByAssociationId: "assoc_jla_fixture_1",
      confirmationMethod: QUALIFICATION_CONFIRMATION_METHOD_REVIEW,
      confirmationInvalidatedAt: null,
    });
  });

  it("PF 承認は公式確認を書かない", () => {
    expect(
      buildConfirmationMutation({
        current: { ...snapshot, status: "PENDING", confirmedAt: null },
        nextStatus: "APPROVED",
        nextTemplateId: snapshot.templateId,
        nextCertNumber: snapshot.certNumber,
        nextExpiryDate: snapshot.expiryDate,
        canWriteOfficialConfirmation: false,
        actorUserId: "pf-admin",
        associationId: null,
        now,
      })
    ).toEqual({});
  });

  it("変更時は無効化し、スナップショット一致では復活させない", () => {
    expect(
      shouldInvalidateActiveConfirmation({
        current: snapshot,
        nextStatus: "REJECTED",
        nextTemplateId: snapshot.templateId,
        nextCertNumber: snapshot.certNumber,
        nextExpiryDate: snapshot.expiryDate,
      })
    ).toBe(true);

    const invalidated = buildConfirmationMutation({
      current: snapshot,
      nextStatus: "REJECTED",
      nextTemplateId: snapshot.templateId,
      nextCertNumber: snapshot.certNumber,
      nextExpiryDate: snapshot.expiryDate,
      canWriteOfficialConfirmation: false,
      actorUserId: "pf-admin",
      associationId: null,
      now,
    });
    expect(invalidated).toEqual({ confirmationInvalidatedAt: now });

    expect(
      buildConfirmationMutation({
        current: { ...snapshot, confirmationInvalidatedAt: now },
        nextStatus: "APPROVED",
        nextTemplateId: snapshot.templateId,
        nextCertNumber: snapshot.certNumber,
        nextExpiryDate: snapshot.expiryDate,
        canWriteOfficialConfirmation: false,
        actorUserId: "pf-admin",
        associationId: null,
        now: new Date("2026-04-01T00:00:00.000Z"),
      })
    ).toEqual({});
    expect(
      isActiveOfficialConfirmation({
        ...snapshot,
        confirmationInvalidatedAt: now,
      })
    ).toBe(false);
  });
});

describe("confirmation evidence and owner delete", () => {
  it("確認根拠がある PENDING は本人削除できない", () => {
    expect(hasConfirmationEvidence({ confirmedAt: new Date() })).toBe(true);
    expect(
      canOwnerPhysicallyDeleteQualification({
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
        confirmedAt: new Date(),
      })
    ).toBe(false);
    expect(
      ownerQualificationDeselectLock({
        recordOrigin: "USER_APPLICATION",
        status: "PENDING",
        confirmedAt: new Date(),
      })
    ).toBe("not_cancellable");
  });
});
