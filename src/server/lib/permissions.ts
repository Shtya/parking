import { Role } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Permission catalog. Each guarded API route declares one of these keys.
 * Admins configure, per user: allowed? · requires approval? · who approves.
 * Users without a custom row get the role default below. ADMIN is never restricted.
 */
export const PERMISSIONS = [
  'contracts.create',
  'contracts.update',
  'contracts.renew',
  'contracts.terminate',
  'tenants.create',
  'tenants.update',
  'tenants.delete',
  'spots.edit',
  'imports.commit',
  'settings.update',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const ALL = Object.fromEntries(PERMISSIONS.map((p) => [p, true])) as Record<PermissionKey, boolean>;

/** Role defaults (match the behaviour before per-user permissions existed). */
export const ROLE_DEFAULTS: Record<Role, Record<PermissionKey, boolean>> = {
  ADMIN: ALL,
  OWNER: ALL,
  STAFF: {
    ...ALL,
    'contracts.terminate': false,
    'tenants.delete': false,
    'settings.update': false,
  },
};

export interface PermissionDecision {
  permission: PermissionKey;
  allowed: boolean;
  requiresApproval: boolean;
  approverId: string | null;
  source: 'role' | 'custom';
}

export function isPermission(v: string): v is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(v);
}

export async function resolvePermission(user: { id: string; role: Role }, permission: PermissionKey): Promise<PermissionDecision> {
  if (user.role === Role.ADMIN) return { permission, allowed: true, requiresApproval: false, approverId: null, source: 'role' };
  const row = await prisma.userPermission.findUnique({ where: { userId_permission: { userId: user.id, permission } } });
  if (!row) return { permission, allowed: ROLE_DEFAULTS[user.role][permission], requiresApproval: false, approverId: null, source: 'role' };
  return {
    permission,
    allowed: row.allowed,
    // an approval rule without an approver (approver deleted) falls back to "needs any admin" — handled by caller
    requiresApproval: row.allowed && row.requiresApproval,
    approverId: row.approverId,
    source: 'custom',
  };
}

/** Effective permission table for one user (role defaults merged with custom rows). */
export async function effectivePermissions(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: true } });
  const rows = await prisma.userPermission.findMany({ where: { userId }, include: { approver: { select: { id: true, name: true, email: true } } } });
  return PERMISSIONS.map((permission) => {
    const row = rows.find((r) => r.permission === permission);
    if (user.role === Role.ADMIN) return { permission, allowed: true, requiresApproval: false, approverId: null, approver: null, source: 'role' as const, locked: true };
    if (!row) return { permission, allowed: ROLE_DEFAULTS[user.role][permission], requiresApproval: false, approverId: null, approver: null, source: 'role' as const, locked: false };
    return { permission, allowed: row.allowed, requiresApproval: row.allowed && row.requiresApproval, approverId: row.approverId, approver: row.approver, source: 'custom' as const, locked: false };
  });
}
