import { Role } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, Pagination, paginate } from '../lib/route';
import { getSettings, updateSettings, SettingsSchema } from '../lib/settings';
import { audit } from '../lib/audit';

export const settingsRouter = createRouter();
export const miscRouter = createRouter();

route(settingsRouter, '/api/settings', { method: 'get', path: '/', tag: 'Settings', summary: 'Application settings (pricing, thresholds, building name)' }, async () => getSettings());

route(
  settingsRouter, '/api/settings',
  { method: 'patch', path: '/', tag: 'Settings', summary: 'Update settings', auth: [Role.ADMIN, Role.OWNER], body: SettingsSchema.partial().openapi('SettingsInput') },
  async ({ body, user }) => {
    const s = await updateSettings(body);
    await audit(user.id, 'UPDATE', 'Settings', 'general', body);
    return s;
  },
);

route(
  miscRouter, '/api',
  { method: 'get', path: '/units', tag: 'Office units', summary: 'Office units with parking entitlement (1 spot / 70 m²)', query: z.object({ status: z.string().optional() }) },
  async ({ query }) =>
    prisma.officeUnit.findMany({
      where: query.status ? { status: query.status } : {},
      include: { tenant: { select: { id: true, nameAr: true } } },
      orderBy: [{ floorLabel: 'asc' }, { unitNo: 'asc' }],
    }),
);

route(
  miscRouter, '/api',
  { method: 'get', path: '/audit', tag: 'Audit', summary: 'Audit log', auth: [Role.ADMIN, Role.OWNER], query: Pagination.extend({ entity: z.string().optional(), entityId: z.string().optional() }) },
  async ({ query }) => {
    const where = { ...(query.entity ? { entity: query.entity } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(query.page, query.pageSize), include: { user: { select: { name: true, email: true } } } }),
    ]);
    return { total, items, page: query.page, pageSize: query.pageSize };
  },
);

route(miscRouter, '/api', { method: 'get', path: '/health', tag: 'System', summary: 'Health check', auth: false }, async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', time: new Date().toISOString() };
});
