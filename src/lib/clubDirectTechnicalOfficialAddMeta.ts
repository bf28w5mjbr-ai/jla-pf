import type { PrismaClient } from "@prisma/client";
import { getTechnicalOfficialStatusForClub } from "@/lib/technicalOfficialQueries";
import {
  clubDirectTechnicalOfficialAddDeadlineEndUtc,
  isClubDirectTechnicalOfficialAddOpen,
} from "@/lib/clubTechnicalOfficialDirectAddDeadline";

export type ClubDirectTechnicalOfficialAddMeta = {
  allowed: boolean;
  closedReason?: string;
  /** 締切の人間向け表記 */
  closesAtLabel?: string;
};

function formatDeadlineLabelJa(deadlineUtc: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(deadlineUtc);
}

/**
 * クラブ管理者向け「TO 直接追加」が現在可能か（GET 表示・POST 事前と同一条件）。
 * 依頼 API とは異なり、必要人数を満たした後でも追加可能。
 */
export async function computeClubDirectTechnicalOfficialAddMeta(
  prisma: PrismaClient,
  params: {
    competitionId: string;
    clubId: string;
    viewerIsClubAdmin: boolean;
    now?: Date;
  }
): Promise<ClubDirectTechnicalOfficialAddMeta> {
  const now = params.now ?? new Date();

  if (!params.viewerIsClubAdmin) {
    return { allowed: false, closedReason: "クラブ管理者のみ利用できます" };
  }

  const status = await getTechnicalOfficialStatusForClub(
    prisma,
    params.competitionId,
    params.clubId
  );

  if (!status) {
    return { allowed: false, closedReason: "この大会ではテクニカルオフィシャル機能がOFFです" };
  }

  if (!status.configured) {
    return { allowed: false, closedReason: "主催者のTO人数設定待ちです" };
  }

  const competition = await prisma.competition.findUnique({
    where: { id: params.competitionId },
    select: { startDate: true },
  });
  if (!competition) {
    return { allowed: false, closedReason: "大会が見つかりません" };
  }

  const deadlineEnd = clubDirectTechnicalOfficialAddDeadlineEndUtc(new Date(competition.startDate));
  const closesAtLabel = `${formatDeadlineLabelJa(deadlineEnd)}まで`;

  if (!isClubDirectTechnicalOfficialAddOpen(new Date(competition.startDate), now)) {
    return {
      allowed: false,
      closedReason: `クラブからのTO追加は${closesAtLabel}です（開催日前日終了）`,
      closesAtLabel,
    };
  }

  if (status.required <= 0) {
    return {
      allowed: false,
      closedReason: "現在の個人エントリー件数ではテクニカルオフィシャルは不要です",
      closesAtLabel,
    };
  }

  return { allowed: true, closesAtLabel };
}
