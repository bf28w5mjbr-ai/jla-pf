import { prisma } from "@/server/db";
import { isValidJlaMemberNumber, normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";
import {
  findTemplateKindByKeywords,
  matchesQualificationKeywords,
  resolveQualificationTemplateForKindInput,
} from "@/lib/qualificationKindMatch";
import { isQualificationExpired } from "@/lib/qualificationTemplateRules";

type TemplateLite = { kind: string; name: string };

export type SyncHeldQualificationsResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function canonicalKindForQualification(kind: string, templates: TemplateLite[]): string | null {
  const t = resolveQualificationTemplateForKindInput(templates, kind);
  return t?.kind ?? null;
}

/**
 * ログインユーザーが選択した資格種別を、審査なしで DB 上の Qualification と同期する（APPROVED のみ）。
 * kinds が空なら、当該ユーザーの PENDING/APPROVED をすべて削除する。
 */
export async function syncUserHeldQualifications(
  userId: string,
  kindInputs: string[],
  certFromBody?: string | undefined
): Promise<SyncHeldQualificationsResult> {
  const templates = await prisma.qualificationTemplate.findMany({
    select: { kind: true, name: true },
  });

  const target = new Set<string>();
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
    target.add(resolved.kind);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      jlaMemberNumber: true,
    },
  });
  if (!user) {
    return { ok: false, status: 404, error: "ユーザーが見つかりません" };
  }

  const fromBody =
    typeof certFromBody === "string" && certFromBody.trim()
      ? normalizeJlaMemberNumber(certFromBody)
      : "";
  const fromProfile = user.jlaMemberNumber?.trim()
    ? normalizeJlaMemberNumber(user.jlaMemberNumber)
    : "";

  let effectiveCert: string;
  /** アカウントに有効な ID があればそれを優先し、リクエストの certNumber は不要（異なる値なら拒否） */
  if (fromProfile && isValidJlaMemberNumber(fromProfile)) {
    if (fromBody && fromBody !== fromProfile) {
      return {
        ok: false,
        status: 400,
        error:
          "アカウントに登録されたJLAメンバーIDと異なる値が送られました。プロフィールの「保有資格」でメンバーIDを確認してください。",
      };
    }
    effectiveCert = fromProfile;
  } else {
    if (target.size > 0 && !fromBody) {
      return {
        ok: false,
        status: 400,
        error:
          "資格を紐づけるにはJLAメンバーIDが必要です。マイアカウントの「保有資格」でメンバーIDを登録するか、保存時に入力してください。",
      };
    }
    effectiveCert = fromBody;
  }

  if (target.size > 0 && !isValidJlaMemberNumber(effectiveCert)) {
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
      status: true,
      expiryDate: true,
    },
  });

  const toDeleteIds: string[] = [];
  for (const q of existing) {
    const canon = canonicalKindForQualification(q.kind, templates);
    if (canon && !target.has(canon)) {
      toDeleteIds.push(q.id);
    }
  }

  const surviving = existing.filter((q) => !toDeleteIds.includes(q.id));
  const survivingCanonSet = new Set(
    surviving
      .map((q) => canonicalKindForQualification(q.kind, templates))
      .filter((c): c is string => Boolean(c))
  );
  const toAdd = [...target].filter((k) => !survivingCanonSet.has(k));

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

  if (blsKind && target.has(blsKind) && lifesaverKind && target.has(lifesaverKind)) {
    const lifeRow = surviving.find(
      (q) =>
        matchesQualificationKeywords(q.kind, [lifesaverKind]) ||
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

  if (target.size > 0) {
    const existingUser = await prisma.user.findFirst({
      where: {
        jlaMemberNumber: effectiveCert,
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

    const existingQualificationWithNumber = await prisma.qualification.findFirst({
      where: {
        certNumber: effectiveCert,
        status: { in: ["PENDING", "APPROVED"] },
        NOT: { userId },
      },
      select: { id: true },
    });
    if (existingQualificationWithNumber) {
      return {
        ok: false,
        status: 400,
        error: "このJLAメンバーIDは既に別の会員の資格で使用されています",
      };
    }
  }

  const pendingToApprove = surviving.filter((q) => {
    if (q.status !== "PENDING") return false;
    const c = canonicalKindForQualification(q.kind, templates);
    return Boolean(c && target.has(c));
  });

  await prisma.$transaction(async (tx) => {
    if (toDeleteIds.length > 0) {
      await tx.qualification.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
    }

    for (const q of pendingToApprove) {
      await tx.qualification.update({
        where: { id: q.id },
        data: {
          status: "APPROVED",
          certNumber: effectiveCert,
        },
      });
    }

    for (const kind of toAdd) {
      await tx.qualification.create({
        data: {
          userId,
          kind,
          certNumber: effectiveCert,
          issueDate: null,
          expiryDate: null,
          status: "APPROVED",
        },
      });
    }

    if (target.size > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { jlaMemberNumber: effectiveCert },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "QUALIFICATION_SELF_SYNC",
      target: `user:${userId}:qualifications`,
      meta: {
        kinds: [...target],
        deletedIds: toDeleteIds,
        addedKinds: toAdd,
        approvedPendingIds: pendingToApprove.map((q) => q.id),
      },
    },
  });

  return { ok: true };
}
