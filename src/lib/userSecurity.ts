import type { Prisma } from "@prisma/client";
import { AuthLoginChannel } from "@prisma/client";
import { prisma } from "@/server/db";

/** Read shape for UserSecurity nested under User. */
export const userSecuritySelect = {
  emailVerified: true,
  passwordHash: true,
  mfaEnabled: true,
  mfaEnforced: true,
  lastLoginAt: true,
  lastLoginIp: true,
  lastLoginUa: true,
} as const satisfies Prisma.UserSecuritySelect;

export type UserSecurityRead = Prisma.UserSecurityGetPayload<{
  select: typeof userSecuritySelect;
}>;

export type LoginEventRead = {
  id: string;
  channel: AuthLoginChannel;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export const loginEventListSelect = {
  id: true,
  channel: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
} as const satisfies Prisma.UserLoginEventSelect;

export function authLoginChannelLabel(channel: AuthLoginChannel): string {
  switch (channel) {
    case AuthLoginChannel.PASSWORD:
      return "メール・パスワード";
    case AuthLoginChannel.SMS_OTP:
      return "SMS";
    case AuthLoginChannel.PASSKEY:
      return "パスキー";
    case AuthLoginChannel.REGISTRATION:
      return "新規登録";
    default:
      return channel;
  }
}

export async function ensureUserSecurityRow(userId: string) {
  return prisma.userSecurity.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export type RecordLoginSuccessInput = {
  userId: string;
  channel: AuthLoginChannel;
  ip: string;
  userAgent: string;
  at?: Date;
};

/** Updates last-login snapshot on UserSecurity and appends UserLoginEvent. */
export async function recordLoginSuccess(input: RecordLoginSuccessInput) {
  const at = input.at ?? new Date();
  const ua = input.userAgent.slice(0, 512);

  await prisma.$transaction([
    prisma.userSecurity.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        lastLoginAt: at,
        lastLoginIp: input.ip,
        lastLoginUa: ua || null,
      },
      update: {
        lastLoginAt: at,
        lastLoginIp: input.ip,
        lastLoginUa: ua || null,
      },
    }),
    prisma.userLoginEvent.create({
      data: {
        userId: input.userId,
        channel: input.channel,
        ipAddress: input.ip,
        userAgent: ua || null,
        createdAt: at,
      },
    }),
  ]);
}
