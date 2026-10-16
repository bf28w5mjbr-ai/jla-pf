import { QualificationRecordOrigin } from "@prisma/client";
import { prisma } from "@/server/db";
import { isValidJlaMemberNumber, normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";
import {
  buildOwnerQualificationCancelManyWhere,
  confirmationHistoryFields,
  partitionQualificationsForOwnerSync,
  QUALIFICATION_BLOCKED_FROM_OWNER_ADD_ERROR,
  QUALIFICATION_OWNER_CANCEL_CONFLICT,
  selectedBlockedFromOwnerAddTemplateIds,
} from "@/lib/qualificationOwnerRules";
import {
  findTemplateKindByKeywords,
  matchesQualificationKeywords,
  resolveQualificationTemplateForKindInput,
} from "@/lib/qualificationKindMatch";
import { isQualificationExpired } from "@/lib/qualificationTemplateRules";

type TemplateWithId = { id: string; kind: string; name: string };
const QUALIFICATION_SELF_SYNC_TX_OPTIONS = {
  maxWait: 20_000,
  timeout: 60_000,
} as const;

export type SyncHeldQualificationsResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function resolveTemplateForQualification(kind: string, templates: TemplateWithId[]): TemplateWithId | null {
  return resolveQualificationTemplateForKindInput(templates, kind) ?? null;
}

/**
 * ログインユーザーが選択した自己申告資格を DB 上の Qualification と同期する。
 * 協会インポート・承認済み・却下・期限切れはユーザー操作では削除しない。
 * USER_APPLICATION かつ PENDING のみ、選択解除で取消できる。
 */
export async function syncUserHeldQualifications(
  userId: string,
  kindInputs: string[],
  jlaMemberNumberFromBody?: string | undefined,
  templateIdInputs: string[] = []
): Promise<SyncHeldQualificationsResult> {
  const templates = await prisma.qualificationTemplate.findMany({
    select: { id: true, kind: true, name: true },
  });

  const targetTemplateIds = new Set<string>();
  const targetKindByTemplateId = new Map<string, string>();
  const templateById = new Map(templates.map((template) => [template.id, template]));

  for (const raw of templateIdInputs) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) continue;
    const resolved = templateById.get(trimmed);
    if (!resolved) {
      return {
        ok: false,
        status: 400,
        error: "指定された資格は登録できません。資格一覧から選択してください。",
      };
    }
    targetTemplateIds.add(resolved.id);
    targetKindByTemplateId.set(resolved.id, resolved.kind);
  }

  for (const raw of kindInputs) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) continue;
    const resolved = resolveQualificationTemplateForKindInput(templates, trimmed);
    if (!resolved) {
      return {
        ok: false,
        status: 400,
        error: "指定された資格は登録できません。資格一覧から選択してください。",
      };
    }
    targetTemplateIds.add(resolved.id);
    targetKindByTemplateId.set(resolved.id, resolved.kind);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      jlaProfile: { select: { jlaMemberNumber: true } },
    },
  });
  if (!user) {
    return { ok: false, status: 404, error: "ユーザーが見つかりません" };
  }

  const fromBody =
    typeof jlaMemberNumberFromBody === "string" && jlaMemberNumberFromBody.trim()
      ? normalizeJlaMemberNumber(jlaMemberNumberFromBody)
      : "";
  const fromProfile = user.jlaProfile?.jlaMemberNumber?.trim()
    ? normalizeJlaMemberNumber(user.jlaProfile.jlaMemberNumber)
    : "";

  let effectiveJlaMemberNumber: string;
  if (fromProfile && isValidJlaMemberNumber(fromProfile)) {
    if (fromBody && fromBody !== fromProfile) {
      return {
        ok: false,
        status: 400,
        error:
          "アカウントに登録されたJLAメンバーIDと異なる値が送られました。プロフィールの「資格の管理」でメンバーIDを確認してください。",
      };
    }
    effectiveJlaMemberNumber = fromProfile;
  } else {
    if (targetTemplateIds.size > 0 && !fromBody) {
      return {
        ok: false,
        status: 400,
        error:
          "資格を紐づけるにはJLAメンバーIDが必要です。マイアカウントの「資格の管理」でJLAメンバーIDを登録するか、保存時に入力してください。",
      };
    }
    effectiveJlaMemberNumber = fromBody;
  }

  if (targetTemplateIds.size > 0 && !isValidJlaMemberNumber(effectiveJlaMemberNumber)) {
    return {
      ok: false,
      status: 400,
      error: "JLAメンバーIDは500から始まる9桁の半角数字で入力してください",
    };
  }

  const existing = await prisma.qualification.findMany({
    where: { userId },
    select: {
      id: true,
      kind: true,
      templateId: true,
      certNumber: true,
      issueDate: true,
      status: true,
      expiryDate: true,
      attachmentUrl: true,
      recordOrigin: true,
      confirmedAt: true,
      confirmationInvalidatedAt: true,
      confirmedTemplateId: true,
      confirmedCertNumber: true,
      confirmedExpiryDate: true,
      confirmedByUserId: true,
      confirmedByAssociationId: true,
      confirmationMethod: true,
    },
  });

  const resolveExistingTemplateId = (q: (typeof existing)[number]) =>
    q.templateId ?? resolveTemplateForQualification(q.kind, templates)?.id ?? null;

  const {
    occupancyTemplateIds,
    heldForPrerequisite,
    cancellable,
    blockedFromAddTemplateIds,
  } = partitionQualificationsForOwnerSync(existing, resolveExistingTemplateId);

  const blockedSelected = selectedBlockedFromOwnerAddTemplateIds(
    targetTemplateIds,
    blockedFromAddTemplateIds
  );
  if (blockedSelected.length > 0) {
    return {
      ok: false,
      status: 400,
      error: QUALIFICATION_BLOCKED_FROM_OWNER_ADD_ERROR,
    };
  }

  const toDeleteIds: string[] = [];
  for (const q of cancellable) {
    const templateId = resolveExistingTemplateId(q);
    if (templateId && !targetTemplateIds.has(templateId)) {
      toDeleteIds.push(q.id);
    }
  }

  const toAdd = [...targetTemplateIds].filter(
    (templateId) => !occupancyTemplateIds.has(templateId)
  );

  const blsKind = findTemplateKindByKeywords(templates, [
    "BLS・WS",
    "BLS/WS",
    "blsws",
    "ベーシックライフセーバー",
  ]);
  const lifesaverKind = findTemplateKindByKeywords(templates, [
    "認定ライフセーバー",
    "certified lifesaver",
    "cls",
  ]);
  const blsTemplate = blsKind ? resolveQualificationTemplateForKindInput(templates, blsKind) : null;
  const lifesaverTemplate = lifesaverKind
    ? resolveQualificationTemplateForKindInput(templates, lifesaverKind)
    : null;

  if (
    blsTemplate &&
    targetTemplateIds.has(blsTemplate.id) &&
    lifesaverTemplate &&
    targetTemplateIds.has(lifesaverTemplate.id)
  ) {
    const lifeRow = heldForPrerequisite.find(
      (q) =>
        q.templateId === lifesaverTemplate.id ||
        matchesQualificationKeywords(q.kind, [lifesaverTemplate.kind]) ||
        matchesQualificationKeywords(q.kind, ["認定ライフセーバー"])
    );
    const lifesaverEffective = !lifeRow || !isQualificationExpired(lifeRow.expiryDate);
    if (lifesaverEffective) {
      return {
        ok: false,
        status: 400,
        error: "認定ライフセーバーを保有しているためBLS・WSは不要です",
      };
    }
  }

  if (targetTemplateIds.size > 0) {
    const existingUser = await prisma.user.findFirst({
      where: {
        jlaProfile: { is: { jlaMemberNumber: effectiveJlaMemberNumber } },
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (existingUser) {
      return {
        ok: false,
        status: 400,
        error: "このJLAメンバーIDは既に別の会員に紐づいています",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
    if (toDeleteIds.length > 0) {
      const archived = existing.filter((q) => toDeleteIds.includes(q.id));
      await tx.qualificationHistory.createMany({
        data: archived.map((q) => ({
          qualificationId: q.id,
          sourceQualificationId: q.id,
          userId,
          templateId: q.templateId,
          kind: q.kind,
          certNumber: q.certNumber,
          issueDate: q.issueDate,
          expiryDate: q.expiryDate,
          status: q.status,
          attachmentUrl: q.attachmentUrl,
          recordOrigin: q.recordOrigin,
          ...confirmationHistoryFields(q),
          changeType: "STATUS_CHANGE",
        })),
      });
      const deleted = await tx.qualification.deleteMany({
        where: buildOwnerQualificationCancelManyWhere({
          ids: toDeleteIds,
          userId,
        }),
      });
      if (deleted.count !== toDeleteIds.length) {
        throw new Error(QUALIFICATION_OWNER_CANCEL_CONFLICT);
      }
    }

    const qualificationCreatePayload = toAdd
      .map((templateId) => {
        const kind = targetKindByTemplateId.get(templateId);
        if (!kind) return null;
        return {
          userId,
          templateId,
          kind,
          certNumber: null,
          issueDate: null,
          expiryDate: null,
          status: "PENDING" as const,
          recordOrigin: QualificationRecordOrigin.USER_APPLICATION,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    if (qualificationCreatePayload.length > 0) {
      await tx.qualification.createMany({
        data: qualificationCreatePayload,
      });
    }

    if (targetTemplateIds.size > 0) {
      await tx.userJlaProfile.upsert({
        where: { userId },
        create: { userId, jlaMemberNumber: effectiveJlaMemberNumber },
        update: { jlaMemberNumber: effectiveJlaMemberNumber },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "QUALIFICATION_SELF_SYNC",
        target: `user:${userId}:qualifications`,
        meta: {
          kinds: [...targetKindByTemplateId.values()],
          templateIds: [...targetTemplateIds],
          deletedIds: toDeleteIds,
          addedTemplateIds: toAdd,
          approvedPendingIds: [],
        },
      },
    });
    }, QUALIFICATION_SELF_SYNC_TX_OPTIONS);
  } catch (err) {
    if (err instanceof Error && err.message === QUALIFICATION_OWNER_CANCEL_CONFLICT) {
      return { ok: false, status: 409, error: "取消が競合しました" };
    }
    throw err;
  }

  return { ok: true };
}