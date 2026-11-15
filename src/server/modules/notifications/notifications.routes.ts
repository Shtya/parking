import crypto from 'node:crypto';
import { Channel, Role } from '@prisma/client';
import { z } from '../../lib/zod';
import { prisma } from '../../lib/prisma';
import { env, isProd } from '../../lib/env';
import { createRouter, route, IdParams } from '../../lib/route';
import { unauthorized } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { runRemindersSafely } from './scheduler';

export const notificationsRouter = createRouter();
const BASE = '/api/notifications';

route(
  notificationsRouter, BASE,
  { method: 'get', path: '/', tag: 'Notifications', summary: 'My in-app notifications', query: z.object({ unread: z.enum(['true', 'false']).optional(), take: z.coerce.number().int().min(1).max(200).default(50) }) },
  async ({ user, query }) => {
    const where = { userId: user.id, ...(query.unread === 'true' ? { readAt: null } : {}) };
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: query.take }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  },
);

route(notificationsRouter, BASE, { method: 'post', path: '/:id/read', tag: 'Notifications', summary: 'Mark as read', params: IdParams, status: 200 }, async ({ user, params }) => {
  await prisma.notification.updateMany({ where: { id: params.id, userId: user.id }, data: { readAt: new Date() } });
  return { ok: true };
});

route(notificationsRouter, BASE, { method: 'post', path: '/read-all', tag: 'Notifications', summary: 'Mark all as read', status: 200 }, async ({ user }) => {
  const r = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return { updated: r.count };
});

route(
  notificationsRouter, BASE,
  {
    method: 'get', path: '/deliveries', tag: 'Notifications', summary: 'Outbound delivery log (email / whatsapp / sms / in-app)', auth: [Role.ADMIN, Role.OWNER],
    query: z.object({ contractId: z.string().optional(), take: z.coerce.number().int().max(500).default(100) }),
  },
  async ({ query }) =>
    prisma.notificationDelivery.findMany({
      where: query.contractId ? { contractId: query.contractId } : {},
      orderBy: { createdAt: 'desc' },
      take: query.take,
      include: { contract: { select: { number: true, tenant: { select: { nameAr: true } } } } },
    }),
);

route(notificationsRouter, BASE, { method: 'post', path: '/run', tag: 'Notifications', summary: 'Run the reminder job now (idempotent)', auth: [Role.ADMIN, Role.OWNER], status: 200 }, async ({ user }) => {
  const result = await runRemindersSafely(`manual:${user.email}`);
  await audit(user.id, 'RUN', 'Reminders', null, result);
  return result ?? { skipped: true };
});

// ── Vercel Cron (vercel.json → GET /api/cron/reminders, header: Authorization: Bearer $CRON_SECRET) ──
route(
  notificationsRouter, '/api/cron',
  { method: 'get', path: '/reminders', tag: 'Notifications', summary: 'Daily reminder job (Vercel Cron, requires CRON_SECRET)', auth: false },
  async ({ req }) => {
    const secret = env.CRON_SECRET;
    const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const ok = secret ? given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret)) : !isProd();
    if (!ok) throw unauthorized('Invalid cron secret');
    return (await runRemindersSafely('vercel-cron')) ?? { skipped: true };
  },
);

// ── reminder rules ──
const RuleInput = z
  .object({
    daysBefore: z.number().int().min(1).max(365),
    channels: z.array(z.nativeEnum(Channel)).min(1),
    notifyOwner: z.boolean().default(true),
    notifyTenant: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .openapi('ReminderRuleInput');

route(notificationsRouter, BASE, { method: 'get', path: '/rules', tag: 'Notifications', summary: 'List reminder rules' }, async () =>
  prisma.reminderRule.findMany({ orderBy: { daysBefore: 'desc' } }),
);
route(notificationsRouter, BASE, { method: 'post', path: '/rules', tag: 'Notifications', summary: 'Create reminder rule', auth: [Role.ADMIN, Role.OWNER], body: RuleInput }, async ({ body, user }) => {
  const r = await prisma.reminderRule.create({ data: body });
  await audit(user.id, 'CREATE', 'ReminderRule', r.id, body);
  return r;
});
route(
  notificationsRouter, BASE,
  { method: 'patch', path: '/rules/:id', tag: 'Notifications', summary: 'Update reminder rule', auth: [Role.ADMIN, Role.OWNER], params: IdParams, body: RuleInput.partial() },
  async ({ params, body, user }) => {
    const r = await prisma.reminderRule.update({ where: { id: params.id }, data: body });
    await audit(user.id, 'UPDATE', 'ReminderRule', r.id, body);
    return r;
  },
);
route(notificationsRouter, BASE, { method: 'delete', path: '/rules/:id', tag: 'Notifications', summary: 'Delete reminder rule', auth: [Role.ADMIN, Role.OWNER], params: IdParams }, async ({ params, user }) => {
  await prisma.reminderRule.delete({ where: { id: params.id } });
  await audit(user.id, 'DELETE', 'ReminderRule', params.id);
  return undefined;
});
