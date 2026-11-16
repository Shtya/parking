import { Role, ContractStatus, type Prisma } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, IdParams, Pagination, paginate } from '../lib/route';
import { notFound } from '../lib/errors';
import { today, addDays, daysBetween } from '../lib/dates';
import { ContractInput, RenewInput, TerminateInput, createContract, renewContract, terminateContract, updateContract } from './contracts.service';

export const contractsRouter = createRouter();
const BASE = '/api/contracts';
const WRITE = [Role.ADMIN, Role.OWNER, Role.STAFF];

const include = {
  tenant: { select: { id: true, nameAr: true, nameEn: true, code: true, minSpots: true } },
  spots: { include: { spot: { select: { id: true, label: true, type: true, floor: { select: { code: true, nameAr: true, nameEn: true } } } } } },
  allocations: { include: { floor: { select: { code: true, nameAr: true, nameEn: true } } } },
  renewedFrom: { select: { id: true, number: true } },
  renewedBy: { select: { id: true, number: true } },
} satisfies Prisma.ContractInclude;

const withDays = <T extends { endDate: Date }>(c: T) => ({ ...c, daysLeft: daysBetween(today(), c.endDate) });

route(
  contractsRouter, BASE,
  {
    method: 'get', path: '/', tag: 'Contracts', summary: 'List contracts',
    query: Pagination.extend({
      status: z.nativeEnum(ContractStatus).optional(),
      tenantId: z.string().optional(),
      expiringWithinDays: z.coerce.number().int().min(0).max(730).optional(),
      needsReview: z.enum(['true', 'false']).optional(),
    }),
  },
  async ({ query }) => {
    const where: Prisma.ContractWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.needsReview ? { needsReview: query.needsReview === 'true' } : {}),
      ...(query.expiringWithinDays !== undefined ? { status: ContractStatus.ACTIVE, endDate: { lte: addDays(today(), query.expiringWithinDays) } } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { tenant: { nameAr: { contains: query.q, mode: 'insensitive' } } },
              { tenant: { nameEn: { contains: query.q, mode: 'insensitive' } } },
              { tenant: { code: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.contract.count({ where }),
      prisma.contract.findMany({
        where, ...paginate(query.page, query.pageSize),
        orderBy: query.expiringWithinDays !== undefined ? { endDate: 'asc' } : { createdAt: 'desc' },
        include: { tenant: { select: { id: true, nameAr: true, nameEn: true, code: true } }, _count: { select: { spots: true } }, allocations: { select: { quantity: true } } },
      }),
    ]);
    return {
      total, page: query.page, pageSize: query.pageSize,
      items: items.map(({ allocations, ...c }) => ({ ...withDays(c), spotCount: c._count.spots + allocations.reduce((a, b) => a + b.quantity, 0) })),
    };
  },
);

route(contractsRouter, BASE, { method: 'get', path: '/:id', tag: 'Contracts', summary: 'Contract details', params: IdParams }, async ({ params }) => {
  const c = await prisma.contract.findUnique({ where: { id: params.id }, include: { ...include, deliveries: { orderBy: { createdAt: 'desc' }, take: 50 } } });
  if (!c) throw notFound('Contract');
  return withDays(c);
});

route(contractsRouter, BASE, { method: 'post', path: '/', tag: 'Contracts', summary: 'Create annual contract (validates min spots & spot availability)', auth: WRITE, permission: 'contracts.create', body: ContractInput }, async ({ body, user }) => {
  const c = await createContract(body, user);
  return prisma.contract.findUniqueOrThrow({ where: { id: c.id }, include });
});

route(
  contractsRouter, BASE,
  {
    method: 'patch', path: '/:id', tag: 'Contracts', summary: 'Update contract (dates, spots, amount, notes, review flag)', auth: WRITE, permission: 'contracts.update', params: IdParams,
    body: ContractInput.partial().omit({ tenantId: true }).extend({ needsReview: z.boolean().optional() }),
  },
  async ({ params, body, user }) => {
    await updateContract(params.id, body, user);
    return prisma.contract.findUniqueOrThrow({ where: { id: params.id }, include });
  },
);

route(contractsRouter, BASE, { method: 'post', path: '/:id/renew', tag: 'Contracts', summary: 'Renew for another year (copies spots unless overridden)', auth: WRITE, permission: 'contracts.renew', params: IdParams, body: RenewInput }, async ({ params, body, user }) => {
  const c = await renewContract(params.id, body, user);
  return prisma.contract.findUniqueOrThrow({ where: { id: c.id }, include });
});

route(
  contractsRouter, BASE,
  { method: 'post', path: '/:id/terminate', tag: 'Contracts', summary: 'Terminate contract (frees its spots)', permission: 'contracts.terminate', params: IdParams, body: TerminateInput, status: 200 },
  async ({ params, body, user }) => {
    await terminateContract(params.id, body, user);
    return prisma.contract.findUniqueOrThrow({ where: { id: params.id }, include });
  },
);
