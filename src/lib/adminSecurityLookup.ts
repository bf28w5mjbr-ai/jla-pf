import type { Prisma } from "@prisma/client";

/** メールアドレス検索（完全一致） */
export function looksLikeEmailQuery(q: string): boolean {
  return q.includes("@");
}

/**
 * ユーザー ID として一意検索を試す値か（氏名検索と区別するためのヒューリスティック）。
 * cuid 系の英数字のみ・一定長。
 */
export function looksLikeUserIdQuery(q: string): boolean {
  if (q.includes("@")) return false;
  if (q.length < 20 || q.length > 36) return false;
  return /^[a-z][a-z0-9]*$/i.test(q);
}

/** 氏名・カナの部分一致用 where（PostgreSQL + mode insensitive） */
export function buildNameContainsWhere(q: string): Prisma.UserWhereInput {
  return {
    profile: {
      is: {
        OR: [
          { familyName: { contains: q, mode: "insensitive" } },
          { givenName: { contains: q, mode: "insensitive" } },
          { familyNameKana: { contains: q, mode: "insensitive" } },
          { givenNameKana: { contains: q, mode: "insensitive" } },
        ],
      },
    },
  };
}

const MAX_NAME_CANDIDATES = 20;

export function sliceNameSearchCandidates<T>(rows: T[]): {
  candidates: T[];
  truncated: boolean;
} {
  const truncated = rows.length > MAX_NAME_CANDIDATES;
  return {
    candidates: rows.slice(0, MAX_NAME_CANDIDATES),
    truncated,
  };
}

/** 口座番号は下4桁以外マスク（PF 管理者向けでも生番号は返さない） */
export function maskBankAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}
