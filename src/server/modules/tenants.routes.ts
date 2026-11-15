import { Role, TenantStatus, ContractStatus, type Prisma } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, IdParams, Pagination, paginate } from '../lib/route';
import { conflict, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { isoDate, today, daysBetween } from '../lib/dates';

export const tenantsRouter = createRouter();
const BASE = '/api/tenants';
const WRITE = [Role.ADMIN, Role.OWNER, Role.STAFF];

const optEmail = z.string().email().nullable().optional().or(z.literal('').transform(() => null));

const ContactInput = z
  .object({
    name: z.string().min(2),
    position: z.string().nullable().optional(),
    email: optEmail,
    phone: z.string().max(30).nullable().optional(),
    whatsapp: z.string().max(30).nullable().optional(),
    isPrimary: z.boolean().default(false),
    receiveReminders: z.boolean().default(true),
  })
  .openapi('TenantContactInput');

const TenantInput = z
  .object({
    nameAr: z.string().min(2),
    nameEn: z.string().nullable().optional(),
    code: z.string().max(30).nullable().optional().transform((v) => (v ? v.trim().toUpperCase() : v)),
    officeUnits: z.string().nullable().optional(),
    email: optEmail,
    phone: z.string().max(30).nullable().optional(),
    crNumber: z.string().max(30).nullable().optional(),
    minSpots: z.number().int().min(1).max(100).default(2),
    status: z.nativeEnum(TenantStatus).default(TenantStatus.ACTIVE),
    notes: z.string().nullable().optional(),
    contacts: z.array(ContactInput).optional(),
  })
  .openapi('TenantInput');

route(
  tenantsRouter, BASE,
  { method: 'get', path: '/', tag: 'Tenants', summary: 'List tenants with active spot counts', query: Pagination.extend({ status: z.nativeEnum(TenantStatus).optional() }) },
  async ({ query }) => {
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ nameAr: { contains: query.q, mode: 'insensitive' } }, { nameEn: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }, { officeUnits: { contains: query.q } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where, orderBy: { nameAr: 'asc' }, ...paginate(query.page, query.pageSize),
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          contracts: {
            where: { status: ContractStatus.ACTIVE },
            select: { id: true, number: true, endDate: true, needsReview: true, _count: { select: { spots: true } }, allocations: { select: { quantity: true } } },
          },
        },
      }),
    ]);
    const now = today();
    return {
      total, page: query.page, pageSize: query.pageSize,
      items: rows.map(({ contracts, contacts, ...t }) => {
        const numbered = contracts.reduce((a, c) => a + c._count.spots, 0);
        const unnumbered = contracts.reduce((a, c) => a + c.allocations.reduce((x, y) => x + y.quantity, 0), 0);
        const nextEnd = contracts.map((c) => c.endDate).sort((a, b) => a.getTime() - b.getTime())[0];
        return {
          ...t,
          primaryContact: contacts[0] ?? null,
          activeContracts: contracts.length,
          spotCount: numbered + unnumbered,
          numberedSpots: numbered,
          unnumberedSpots: unnumbered,
          belowMinimum: numbered + unnumbered < t.minSpots,
          needsReview: contracts.some((c) => c.needsReview),
          nextExpiry: nextEnd ? isoDate(nextEnd) : null,
          daysToExpiry: nextEnd ? daysBetween(now, nextEnd) : null,
        };
      }),
    };
  },
);

route(tenantsRouter, BASE, { method: 'get', path: '/:id', tag: 'Tenants', summary: 'Tenant details incl. contacts, contracts, spots, units', params: IdParams }, async ({ params }) => {
  const t = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      units: true,
      contracts: {
        orderBy: { startDate: 'desc' },
        include: {
          spots: { include: { spot: { select: { id: true, label: true, type: true, floor: { select: { code: true, nameAr: true, nameEn: true } } } } } },
          allocations: { include: { floor: { select: { code: true, nameAr: true, nameEn: true } } } },
        },
      },
    },
  });
  if (!t) throw notFound('Tenant');
  return t;
});

route(tenantsRouter, BASE, { method: 'post', path: '/', tag: 'Tenants', summary: 'Create tenant (office)', auth: WRITE, body: TenantInput }, async ({ body, user }) => {
  const { contacts, ...data } = body;
  const t = await prisma.tenant.create({ data: { ...data, contacts: contacts?.length ? { create: contacts } : undefined }, include: { contacts: true } });
  await audit(user.id, 'CREATE', 'Tenant', t.id, { nameAr: t.nameAr });
  return t;
});

route(tenantsRouter, BASE, { method: 'patch', path: '/:id', tag: 'Tenants', summary: 'Update tenant', auth: WRITE, params: IdParams, body: TenantInput.omit({ contacts: true }).partial() }, async ({ params, body, user }) => {
  const t = await prisma.tenant.update({ where: { id: params.id }, data: body });
  await audit(user.id, 'UPDATE', 'Tenant', t.id, body);
  return t;
});

route(tenantsRouter, BASE, { method: 'delete', path: '/:id', tag: 'Tenants', summary: 'Delete tenant (only without contracts)', auth: [Role.ADMIN], params: IdParams }, async ({ params, user }) => {
  const count = await prisma.contract.count({ where: { tenantId: params.id } });
  if (count) throw conflict('Tenant has contracts — set status to INACTIVE instead');
  await prisma.tenant.delete({ where: { id: params.id } });
  await audit(user.id, 'DELETE', 'Tenant', params.id);
  return undefined;
});

// ── contacts ──
const ContactParams = z.object({ id: z.string(), contactId: z.string() });

route(tenantsRouter, BASE, { method: 'post', path: '/:id/contacts', tag: 'Tenants', summary: 'Add contact', auth: WRITE, params: IdParams, body: ContactInput }, async ({ params, body, user }) => {
  if (body.isPrimary) await prisma.tenantContact.updateMany({ where: { tenantId: params.id }, data: { isPrimary: false } });
  const c = await prisma.tenantContact.create({ data: { ...body, tenantId: params.id } });
  await audit(user.id, 'CREATE', 'TenantContact', c.id, body);
  return c;
});

route(tenantsRouter, BASE, { method: 'patch', path: '/:id/contacts/:contactId', tag: 'Tenants', summary: 'Update contact', auth: WRITE, params: ContactParams, body: ContactInput.partial() }, async ({ params, body, user }) => {
  if (body.isPrimary) await prisma.tenantContact.updateMany({ where: { tenantId: params.id }, data: { isPrimary: false } });
  const c = await prisma.tenantContact.update({ where: { id: params.contactId, tenantId: params.id }, data: body });
  await audit(user.id, 'UPDATE', 'TenantContact', c.id, body);
  return c;
});

route(tenantsRouter, BASE, { method: 'delete', path: '/:id/contacts/:contactId', tag: 'Tenants', summary: 'Delete contact', auth: WRITE, params: ContactParams }, async ({ params, user }) => {
  await prisma.tenantContact.delete({ where: { id: params.contactId, tenantId: params.id } });
  await audit(user.id, 'DELETE', 'TenantContact', params.contactId);
  return undefined;
});
