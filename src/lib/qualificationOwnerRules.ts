/**
 * 本人の資格選択・取消に関する純粋ルール。
 * DB・認証・環境設定を参照しない（クライアントとサーバーで共有する）。
 */

export type OwnerQualificationCancelWhere = {
  id: string;
  userId: string;
  recordOrigin: "USER_APPLICATION";
  status: "PENDING";
  confirmedAt: null;
};

export type OwnerQualificationCancelManyWhere = {
  id: { in: string[] };
  userId: string;
  recordOrigin: "USER_APPLICATION";
  status: "PENDING";
  confirmedAt: null;
};

export type OwnerPendingSelfUpdateWhere = {
  id: string;
  userId: string;
  templateId: string;
  recordOrigin: "USER_APPLICATION";
  status: "PENDING";
  confirmedAt: null;
  updatedAt: Date;
};

export const QUALIFICATION_DECLARED_FOR_ENTRY_STATUSES = ["PENDING", "APPROVED"] as const;
export const QUALIFICATION_CONFIRMATION_METHOD_REVIEW = "REVIEW";
export const QUALIFICATION_REQUIREMENTS_VERIFIED_LABEL = "資格要件確認済み";
export const QUALIFICATION_REQUIREMENTS_PENDING_LABEL = "資格要件確認待ち";

export const QUALIFICATION_OWNER_CANCEL_CONFLICT = "QUALIFICATION_OWNER_CANCEL_CONFLICT";
export const QUALIFICATION_OWNER_PENDING_UPDATE_CONFLICT =
  "QUALIFICATION_OWNER_PENDING_UPDATE_CONFLICT";
export const QUALIFICATION_BLOCKED_FROM_OWNER_ADD_ERROR =
  "却下または期限切れの資格は追加・再作成できません。";

export type OwnerQualificationDeselectLock = "official_import" | "not_cancellable";

export type OwnerQualificationSyncRow = {
  id: string;
  templateId: string | null;
  kind: string;
  status: string;
  recordOrigin: string;
  confirmedAt?: Date | string | null;
};

export type QualificationConfirmationSnapshot = {
  confirmedAt: Date | string | null;
  confirmationInvalidatedAt?: Date | string | null;
  confirmedTemplateId?: string | null;
  confirmedCertNumber?: string | null;
  confirmedExpiryDate?: Date | string | null;
  confirmedByUserId?: string | null;
  confirmedByAssociationId?: string | null;
  confirmationMethod?: string | null;
};

function nonEmptyText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function hasConfirmationEvidence(row: {
  confirmedAt?: Date | string | null;
}): boolean {
  return row.confirmedAt != null && String(row.confirmedAt) !== "";
}

/** 確認主体・操作者・方式が揃っている。欠けた根拠は公式確認にしない。 */
export function hasCompleteOfficialConfirmationActors(
  row: QualificationConfirmationSnapshot
): boolean {
  return (
    hasConfirmationEvidence(row) &&
    nonEmptyText(row.confirmedByUserId) &&
    nonEmptyText(row.confirmedByAssociationId) &&
    nonEmptyText(row.confirmationMethod)
  );
}

export function isConfirmationInvalidated(
  row: Pick<QualificationConfirmationSnapshot, "confirmationInvalidatedAt">
): boolean {
  return (
    row.confirmationInvalidatedAt != null && String(row.confirmationInvalidatedAt) !== ""
  );
}

export function confirmationSnapshotMatchesHeldFields(input: {
  templateId: string;
  certNumber: string | null;
  expiryDate: Date | string | null;
  confirmedTemplateId?: string | null;
  confirmedCertNumber?: string | null;
  confirmedExpiryDate?: Date | string | null;
}): boolean {
  return (
    (input.confirmedTemplateId ?? null) === input.templateId &&
    (input.confirmedCertNumber ?? null) === (input.certNumber ?? null) &&
    confirmationFieldEquals(input.confirmedExpiryDate, input.expiryDate)
  );
}

/**
 * 保有の公式確認。APPROVED・主体/操作者/方式の完全性・現行値とのスナップショット一致・未無効化。
 * 大会エントリーの「資格要件確認済み」とは別判定。
 */
export function isActiveOfficialConfirmation(
  row: QualificationConfirmationSnapshot & {
    status: string;
    templateId: string;
    certNumber: string | null;
    expiryDate: Date | string | null;
  }
): boolean {
  return (
    row.status === "APPROVED" &&
    !isConfirmationInvalidated(row) &&
    hasCompleteOfficialConfirmationActors(row) &&
    confirmationSnapshotMatchesHeldFields(row)
  );
}

function dateMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function confirmationFieldEquals(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined
): boolean {
  if (left == null && right == null) return true;
  if (left instanceof Date || right instanceof Date || (typeof left === "string" && typeof right === "string" && left.includes("T"))) {
    return dateMs(left ?? null) === dateMs(right ?? null);
  }
  return (left ?? null) === (right ?? null);
}

export function shouldInvalidateActiveConfirmation(input: {
  current: QualificationConfirmationSnapshot & {
    status: string;
    templateId: string;
    certNumber: string | null;
    expiryDate: Date | string | null;
  };
  nextStatus: string;
  nextTemplateId: string;
  nextCertNumber: string | null;
  nextExpiryDate: Date | string | null;
}): boolean {
  if (!hasConfirmationEvidence(input.current) || isConfirmationInvalidated(input.current)) {
    return false;
  }
  return (
    input.nextStatus !== input.current.status ||
    input.nextTemplateId !== input.current.templateId ||
    (input.nextCertNumber ?? null) !== (input.current.certNumber ?? null) ||
    dateMs(input.nextExpiryDate) !== dateMs(input.current.expiryDate)
  );
}

export function buildOfficialConfirmationWrite(input: {
  now: Date;
  actorUserId: string;
  associationId: string;
  templateId: string;
  certNumber: string | null;
  expiryDate: Date | null;
}): {
  confirmedAt: Date;
  confirmedByUserId: string;
  confirmedByAssociationId: string;
  confirmationMethod: string;
  confirmedTemplateId: string;
  confirmedCertNumber: string | null;
  confirmedExpiryDate: Date | null;
  confirmationInvalidatedAt: null;
} {
  return {
    confirmedAt: input.now,
    confirmedByUserId: input.actorUserId,
    confirmedByAssociationId: input.associationId,
    confirmationMethod: QUALIFICATION_CONFIRMATION_METHOD_REVIEW,
    confirmedTemplateId: input.templateId,
    confirmedCertNumber: input.certNumber,
    confirmedExpiryDate: input.expiryDate,
    confirmationInvalidatedAt: null,
  };
}

export function buildConfirmationMutation(input: {
  current: QualificationConfirmationSnapshot & {
    status: string;
    templateId: string;
    certNumber: string | null;
    expiryDate: Date | string | null;
  };
  nextStatus: string;
  nextTemplateId: string;
  nextCertNumber: string | null;
  nextExpiryDate: Date | null;
  canWriteOfficialConfirmation: boolean;
  actorUserId: string;
  associationId: string | null;
  now: Date;
}): ReturnType<typeof buildOfficialConfirmationWrite> | { confirmationInvalidatedAt: Date } | Record<string, never> {
  if (
    input.canWriteOfficialConfirmation &&
    input.nextStatus === "APPROVED" &&
    input.associationId
  ) {
    return buildOfficialConfirmationWrite({
      now: input.now,
      actorUserId: input.actorUserId,
      associationId: input.associationId,
      templateId: input.nextTemplateId,
      certNumber: input.nextCertNumber,
      expiryDate: input.nextExpiryDate,
    });
  }
  if (
    shouldInvalidateActiveConfirmation({
      current: input.current,
      nextStatus: input.nextStatus,
      nextTemplateId: input.nextTemplateId,
      nextCertNumber: input.nextCertNumber,
      nextExpiryDate: input.nextExpiryDate,
    })
  ) {
    return { confirmationInvalidatedAt: input.now };
  }
  return {};
}

export function confirmationHistoryFields(row: QualificationConfirmationSnapshot): QualificationConfirmationSnapshot {
  return {
    confirmedAt: row.confirmedAt ?? null,
    confirmationInvalidatedAt: row.confirmationInvalidatedAt ?? null,
    confirmedTemplateId: row.confirmedTemplateId ?? null,
    confirmedCertNumber: row.confirmedCertNumber ?? null,
    confirmedExpiryDate: row.confirmedExpiryDate ?? null,
    confirmedByUserId: row.confirmedByUserId ?? null,
    confirmedByAssociationId: row.confirmedByAssociationId ?? null,
    confirmationMethod: row.confirmationMethod ?? null,
  };
}

export function canOwnerPhysicallyDeleteQualification(row: {
  recordOrigin: string;
  status: string;
  confirmedAt?: Date | string | null;
}): boolean {
  return (
    row.recordOrigin === "USER_APPLICATION" &&
    row.status === "PENDING" &&
    !hasConfirmationEvidence(row)
  );
}

/** 保有・前提資格の判定。却下・期限切れは混ぜない。 */
export function isQualificationHeldForPrerequisite(row: { status: string }): boolean {
  return row.status === "PENDING" || row.status === "APPROVED";
}

export function isQualificationBlockedFromOwnerAdd(row: { status: string }): boolean {
  return row.status === "REJECTED" || row.status === "EXPIRED";
}

export function partitionQualificationsForOwnerSync<T extends OwnerQualificationSyncRow>(
  rows: readonly T[],
  resolveTemplateId: (row: T) => string | null
): {
  occupancyTemplateIds: Set<string>;
  heldForPrerequisite: T[];
  cancellable: T[];
  blockedFromAddTemplateIds: Set<string>;
} {
  // 全状態が unique(userId, templateId) の占有枠。保有判定とは混ぜない。
  const occupancyTemplateIds = new Set<string>();
  const heldForPrerequisite: T[] = [];
  const cancellable: T[] = [];
  const blockedFromAddTemplateIds = new Set<string>();

  for (const row of rows) {
    const templateId = resolveTemplateId(row);
    if (templateId) {
      occupancyTemplateIds.add(templateId);
    }
    if (isQualificationHeldForPrerequisite(row)) {
      heldForPrerequisite.push(row);
    }
    if (canOwnerPhysicallyDeleteQualification(row)) {
      cancellable.push(row);
    }
    if (templateId && isQualificationBlockedFromOwnerAdd(row)) {
      blockedFromAddTemplateIds.add(templateId);
    }
  }

  return {
    occupancyTemplateIds,
    heldForPrerequisite,
    cancellable,
    blockedFromAddTemplateIds,
  };
}

export function selectedBlockedFromOwnerAddTemplateIds(
  selectedTemplateIds: Iterable<string>,
  blockedFromAddTemplateIds: ReadonlySet<string>
): string[] {
  return [...selectedTemplateIds].filter((id) => blockedFromAddTemplateIds.has(id));
}

export function ownerQualificationDeselectLock(row: {
  recordOrigin: string;
  status: string;
  confirmedAt?: Date | string | null;
}): OwnerQualificationDeselectLock | null {
  if (hasConfirmationEvidence(row)) return "not_cancellable";
  if (row.recordOrigin === "ASSOCIATION_IMPORT") return "official_import";
  if (!canOwnerPhysicallyDeleteQualification(row)) return "not_cancellable";
  return null;
}

export function mapOwnerQualificationSelectionUi(
  rows: ReadonlyArray<{
    templateId: string;
    recordOrigin: string;
    status: string;
    confirmedAt?: Date | string | null;
  }>
): {
  linkedTemplateIds: string[];
  lockedTemplateIds: string[];
  officialLockedTemplateIds: string[];
  blockedFromAddTemplateIds: string[];
} {
  const linkedTemplateIds: string[] = [];
  const lockedTemplateIds: string[] = [];
  const officialLockedTemplateIds: string[] = [];
  const blockedFromAddTemplateIds: string[] = [];

  for (const row of rows) {
    if (isQualificationBlockedFromOwnerAdd(row)) {
      blockedFromAddTemplateIds.push(row.templateId);
      continue;
    }
    if (!isQualificationHeldForPrerequisite(row)) continue;
    linkedTemplateIds.push(row.templateId);
    const lock = ownerQualificationDeselectLock(row);
    if (lock === "official_import") officialLockedTemplateIds.push(row.templateId);
    if (lock) lockedTemplateIds.push(row.templateId);
  }

  return {
    linkedTemplateIds,
    lockedTemplateIds,
    officialLockedTemplateIds,
    blockedFromAddTemplateIds,
  };
}

export function buildOwnerQualificationPersistTemplateIds(input: {
  checkedTemplateIds: Iterable<string>;
  lockedTemplateIds: Iterable<string>;
  blockedFromAddTemplateIds: Iterable<string>;
}): { templateIds: string[]; blockedSelected: boolean } {
  const blocked = new Set(input.blockedFromAddTemplateIds);
  const merged = new Set([...input.checkedTemplateIds, ...input.lockedTemplateIds]);
  const blockedSelected = [...merged].some((id) => blocked.has(id));
  return {
    templateIds: [...merged].filter((id) => !blocked.has(id)),
    blockedSelected,
  };
}

export function buildOwnerPendingSelfUpdateWhere(input: {
  id: string;
  userId: string;
  templateId: string;
  updatedAt: Date;
}): OwnerPendingSelfUpdateWhere {
  return {
    id: input.id,
    userId: input.userId,
    templateId: input.templateId,
    recordOrigin: "USER_APPLICATION",
    status: "PENDING",
    confirmedAt: null,
    updatedAt: input.updatedAt,
  };
}

export function buildOwnerQualificationCancelWhere(input: {
  id: string;
  userId: string;
}): OwnerQualificationCancelWhere {
  return {
    id: input.id,
    userId: input.userId,
    recordOrigin: "USER_APPLICATION",
    status: "PENDING",
    confirmedAt: null,
  };
}

export function buildOwnerQualificationCancelManyWhere(input: {
  ids: readonly string[];
  userId: string;
}): OwnerQualificationCancelManyWhere {
  return {
    id: { in: [...input.ids] },
    userId: input.userId,
    recordOrigin: "USER_APPLICATION",
    status: "PENDING",
    confirmedAt: null,
  };
}
