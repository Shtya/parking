import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, IdParams } from '../lib/route';
import { badRequest } from '../lib/errors';
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
