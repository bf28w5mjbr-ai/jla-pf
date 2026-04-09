import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { nanoid } from 'nanoid';
import { getTrustedClientIp } from '@/lib/clientIp';
import { maskIpForDisplay, truncateUserAgent } from '@/lib/securityDisplay';
import { safeServerErrorLog } from '@/lib/safeServerLog';

export type AuditAction = string;

export interface AuditLogData {
  action: string;
  actorType: 'USER' | 'SYSTEM';
  actorKey: string;
  targetKey?: string;
  result?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  targetType?: string;
  targetId?: string;
  reasonCode?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  actorUserId?: string;
  targetUserId?: string;
  request?: {
    ip?: string;
    userAgent?: string;
    path?: string;
    method?: string;
    requestId?: string;
  };
}

/** キー名に含まれると監査 meta からマスクする断片（大文字小文字無視・部分一致） */
const PII_KEY_FRAGMENTS = [
  'email',
  'phone',
  'token',
  'password',
  'address',
  'otp',
  'card',
  'birth',
  'postal',
  'kana',
  'emergency',
  'passport',
  'ssn',
  'iban',
  'secret',
  'familyname',
  'givenname',
  'nickname',
  'fullname',
  'mobile',
  'tel',
  'fax',
  'residence',
  'authorization',
  'cookie',
  'bearer',
];

function isSensitiveMetadataKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PII_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (depth > 8) return '[omitted]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 500) return `${value.slice(0, 500)}…`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, depth + 1));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (isSensitiveMetadataKey(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = sanitizeMetadataValue(obj[key], depth + 1);
  }
  return out;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const sanitized = sanitizeMetadataValue(metadata, 0) as Record<string, unknown>;
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function buildAuditTargetString(data: AuditLogData): string | null {
  if (data.targetKey) return data.targetKey;
  if (data.targetType && data.targetId) return `${data.targetType}:${data.targetId}`;
  return null;
}

/** DB の AuditLog.meta に格納する拡張フィールド（スキーマは target + meta のみ） */
function buildAuditMetaPayload(data: AuditLogData): Record<string, unknown> | undefined {
  const base = sanitizeMetadata(data.metadata) ?? {};
  const extended: Record<string, unknown> = {
    ...base,
    actorType: data.actorType,
    actorKey: data.actorKey,
    targetKey: data.targetKey,
    result: data.result,
    targetType: data.targetType,
    targetId: data.targetId,
    reasonCode: data.reasonCode,
    targetUserId: data.targetUserId,
    request: data.request,
  };
  const cleaned = JSON.parse(JSON.stringify(extended)) as Record<string, unknown>;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export async function logAuditAction(data: AuditLogData): Promise<void> {
  try {
    if (!data.actorUserId) {
      if (data.actorType === "USER") {
        console.warn("logAuditAction: actorUserId がありません（USER）", data.action);
      }
      return;
    }

    const meta = buildAuditMetaPayload(data);

    await prisma.auditLog.create({
      data: {
        id: nanoid(),
        actorUserId: data.actorUserId,
        action: data.action,
        target: buildAuditTargetString(data),
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: data.createdAt ?? new Date(),
      },
    });
  } catch (error) {
    safeServerErrorLog(
      "auditLog.logAuditAction",
      {
      error,
      action: data.action,
      actorType: data.actorType,
      actorUserId: data.actorUserId,
      requestId: data.request?.requestId,
      },
      { requestId: data.request?.requestId }
    );
  }
}

/**
 * 監査ログ用リクエスト情報。既定では IP はマスク（法務・調査で生 IP が必要な場合のみ AUDIT_LOG_FULL_CLIENT_IP=true）
 */
export function getRequestContext(req: NextRequest): AuditLogData['request'] {
  const rawIp = getTrustedClientIp(req);
  const storeFullIp = process.env.AUDIT_LOG_FULL_CLIENT_IP === 'true';
  const ip = storeFullIp
    ? rawIp === 'unknown'
      ? undefined
      : rawIp
    : maskIpForDisplay(rawIp === 'unknown' ? null : rawIp);
  const ua = req.headers.get('user-agent') || undefined;
  return {
    ip,
    userAgent: truncateUserAgent(ua, 120),
    path: req.nextUrl.pathname,
    method: req.method,
    requestId: req.headers.get('x-request-id') || undefined,
  };
}
