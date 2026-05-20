import { QualificationRecordOrigin } from "@prisma/client";
import { prisma } from "@/server/db";
import { isValidJlaMemberNumber, normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";
import {
  findTemplateKindByKeywords,
  matchesQualificationKeywords,
  resolveQualificationTemplateForKindInput,
} from "@/lib/qualificationKindMatch";
import { isQualificationExpired } from "@/lib/qualificationTemplateRules";

type TemplateWithId = { id: string; kind: string; name: string };

export type SyncHeldQualificationsResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function resolveTemplateForQualification(kind: string, templates: TemplateWithId[]): TemplateWithId | null {
  return resolveQualificationTemplateForKindInput(templates, kind) ?? null;
}

/**
 * ログインユーザーが選択した自己申告資格を DB 上の Qualification と同期する。
 * 協会インポート由来の資格はユーザー操作では削除しない。
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
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
    },
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
    },
  });

  const existingTemplateIds = new Set(
    existing
      .map((q) => q.templateId ?? resolveTemplateForQualification(q.kind, templates)?.id)
      .filter((id): id is string => Boolean(id))
  );
  const userApplicationExisting = existing.filter(
    (q) => q.recordOrigin === QualificationRecordOrigin.USER_APPLICATION
  );

  const toDeleteIds: string[] = [];
  for (const q of userApplicationExisting) {
    const templateId = q.templateId ?? resolveTemplateForQualification(q.kind, templates)?.id;
    if (templateId && !targetTemplateIds.has(templateId)) {
      toDeleteIds.push(q.id);
    }
  }

  const surviving = userApplicationExisting.filter((q) => !toDeleteIds.includes(q.id));
  const survivingTemplateIds = new Set(
    surviving
      .map((q) => q.templateId ?? resolveTemplateForQualification(q.kind, templates)?.id)
      .filter((id): id is string => Boolean(id))
  );
  const toAdd = [...targetTemplateIds].filter(
    (templateId) => !survivingTemplateIds.has(templateId) && !existingTemplateIds.has(templateId)
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
    const lifeRow = existing.find(
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

  const pendingToApprove = surviving.filter((q) => {
    if (q.status !== "PENDING") return false;
    const templateId = q.templateId ?? resolveTemplateForQualification(q.kind, templates)?.id;
    return Boolean(templateId && targetTemplateIds.has(templateId));
  });

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
          changeType: "STATUS_CHANGE",
        })),
      });
      await tx.qualification.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
    }

    for (const q of pendingToApprove) {
      await tx.qualificationHistory.create({
        data: {
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
          changeType: "STATUS_CHANGE",
        },
      });
      await tx.qualification.update({
        where: { id: q.id },
        data: {
          status: "APPROVED",
        },
      });
    }

    for (const templateId of toAdd) {
      const kind = targetKindByTemplateId.get(templateId);
      if (!kind) continue;
      await tx.qualification.create({
        data: {
          userId,
          templateId,
          kind,
          certNumber: null,
          issueDate: null,
          expiryDate: null,
          status: "APPROVED",
          recordOrigin: QualificationRecordOrigin.USER_APPLICATION,
        },
      });
    }

    if (targetTemplateIds.size > 0) {
      await tx.userJlaProfile.upsert({
        where: { userId },
        create: { userId, jlaMemberNumber: effectiveJlaMemberNumber },
        update: { jlaMemberNumber: effectiveJlaMemberNumber },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "QUALIFICATION_SELF_SYNC",
      target: `user:${userId}:qualifications`,
      meta: {
        kinds: [...targetKindByTemplateId.values()],
        templateIds: [...targetTemplateIds],
        deletedIds: toDeleteIds,
        addedTemplateIds: toAdd,
        approvedPendingIds: pendingToApprove.map((q) => q.id),
      },
    },
  });

  return { ok: true };
}