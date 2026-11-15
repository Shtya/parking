import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

export async function audit(userId: string | undefined, action: string, entity: string, entityId?: string | null, data?: unknown) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entity, entityId: entityId ?? undefined, data: (data ?? undefined) as Prisma.InputJsonValue } });
  } catch (err) {
    logger.warn({ err }, 'audit log failed');
  }
}
