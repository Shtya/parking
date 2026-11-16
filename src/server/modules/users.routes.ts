import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, IdParams } from '../lib/route';
import { badRequest, notFound } from '../lib/errors';
import { PERMISSIONS, ROLE_DEFAULTS, effectivePermissions } from '../lib/permissions';
import { audit } from '../lib/audit';

export const usersRouter = createRouter();
const BASE = '/api/users';

const select = { id: true, email: true, name: true, phone: true, role: true, locale: true, isActive: true, receiveReminders: true, lastLoginAt: true, createdAt: true };

route(usersRouter, BASE, { method: 'get', path: '/', tag: 'Users', summary: 'List users', auth: [Role.ADMIN] }, async () =>
  prisma.user.findMany({ select, orderBy: { createdAt: 'asc' } }),
);

const UserInput = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(2),
  phone: z.string().max(30).nullable().optional(),
  role: z.nativeEnum(Role),
  locale: z.enum(['ar', 'en']).default('ar'),
  password: z.string().min(8),
  receiveReminders: z.boolean().default(true),
});

route(usersRouter, BASE, { method: 'post', path: '/', tag: 'Users', summary: 'Create user', auth: [Role.ADMIN], body: UserInput.openapi('UserInput') }, async ({ body, user }) => {
  const { password, ...rest } = body;
  const created = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 10) }, select });
  await audit(user.id, 'CREATE', 'User', created.id, { email: created.email, role: created.role });
  return created;
});

route(
  usersRouter, BASE,
  {
    method: 'patch', path: '/:id', tag: 'Users', summary: 'Update user (role, status, password reset)', auth: [Role.ADMIN], params: IdParams,
    body: UserInput.partial().extend({ isActive: z.boolean().optional() }),
  },
  async ({ params, body, user }) => {
    if (params.id === user.id && (body.isActive === false || (body.role && body.role !== Role.ADMIN))) throw badRequest('You cannot deactivate or demote yourself');
    const { password, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    const updated = await prisma.user.update({ where: { id: params.id }, data, select });
    if (body.isActive === false) await prisma.refreshToken.updateMany({ where: { userId: params.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(user.id, 'UPDATE', 'User', params.id, { ...rest, passwordChanged: Boolean(password) });
    return updated;
  },
);

route(usersRouter, BASE, { method: 'delete', path: '/:id', tag: 'Users', summary: 'Delete user', auth: [Role.ADMIN], params: IdParams }, async ({ params, user }) => {
  if (params.id === user.id) throw badRequest('You cannot delete yourself');
  await prisma.user.delete({ where: { id: params.id } });
  await audit(user.id, 'DELETE', 'User', params.id);
  return undefined;
});

// ── per-user permissions (allowed · requires approval · approver) ──

const PermissionRow = z.object({
  permission: z.enum(PERMISSIONS),
  allowed: z.boolean(),
  requiresApproval: z.boolean().default(false),
  approverId: z.string().nullable().optional(),
});

route(usersRouter, BASE, { method: 'get', path: '/:id/permissions', tag: 'Users', summary: "User's effective permissions (role defaults + custom rules)", auth: [Role.ADMIN], params: IdParams }, async ({ params }) => {
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!target) throw notFound('User');
  return effectivePermissions(params.id);
});

route(
  usersRouter, BASE,
  {
    method: 'put', path: '/:id/permissions', tag: 'Users', auth: [Role.ADMIN], params: IdParams,
    summary: 'Replace a user\'s permission rules',
    description: 'Each row sets whether the action is allowed, whether it must be approved first, and which user receives the approval request. Rows equal to the role default (allowed as the role allows, no approval) are stored as "role default".',
    body: z.object({ permissions: z.array(PermissionRow) }),
  },
  async ({ params, body, user }) => {
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } });
    if (!target) throw notFound('User');
    if (target.role === Role.ADMIN) throw badRequest('Administrators always have every permission');

    const approverIds = [...new Set(body.permissions.filter((r) => r.allowed && r.requiresApproval).map((r) => r.approverId))];
    if (approverIds.includes(undefined) || approverIds.includes(null)) throw badRequest('Choose who approves each permission that requires approval', undefined, 'APPROVER_REQUIRED');
    if (approverIds.includes(params.id)) throw badRequest('A user cannot approve their own requests', undefined, 'SELF_APPROVER');
    const approvers = await prisma.user.findMany({ where: { id: { in: approverIds as string[] }, isActive: true }, select: { id: true } });
    if (approvers.length !== approverIds.length) throw badRequest('Approver must be an active user', undefined, 'APPROVER_INACTIVE');

    await prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId: params.id } });
      const rows = body.permissions.filter((r) => r.allowed !== ROLE_DEFAULTS[target.role][r.permission] || (r.allowed && r.requiresApproval));
      if (rows.length)
        await tx.userPermission.createMany({
          data: rows.map((r) => ({
            userId: params.id, permission: r.permission, allowed: r.allowed,
            requiresApproval: r.allowed && r.requiresApproval, approverId: r.allowed && r.requiresApproval ? r.approverId! : null,
          })),
        });
    });
    await audit(user.id, 'UPDATE', 'UserPermission', params.id, body.permissions);
    return effectivePermissions(params.id);
  },
);
