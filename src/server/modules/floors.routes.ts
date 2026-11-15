import { Prisma, Role, SpotType, ContractStatus } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route, IdParams } from '../lib/route';
import { notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { isoDate } from '../lib/dates';
import { computeSpotStates, summarize } from './spot-status';

export const floorsRouter = createRouter();
export const spotsRouter = createRouter();

const Geometry = z
  .object({
    points: z.array(z.tuple([z.number(), z.number()])).min(3).max(64),
    cx: z.number(),
    cy: z.number(),
  })
  .openapi('SpotGeometry');

// ───────────── Floors ─────────────

route(floorsRouter, '/api/floors', { method: 'get', path: '/', tag: 'Floors', summary: 'List floors with occupancy stats' }, async () => {
  const [floors, states, allocations] = await Promise.all([
    prisma.floor.findMany({ orderBy: { level: 'asc' }, include: { spots: { select: { id: true } } } }),
    computeSpotStates(),
    prisma.contractAllocation.groupBy({ by: ['floorId'], _sum: { quantity: true }, where: { contract: { status: ContractStatus.ACTIVE } } }),
  ]);
  return floors.map(({ spots, ...f }) => ({
    ...f,
    stats: summarize(spots.map((s) => states.get(s.id)!).filter(Boolean)),
    allocatedUnnumbered: allocations.find((a) => a.floorId === f.id)?._sum.quantity ?? 0,
  }));
});

const FloorCodeParams = z.object({ code: z.string().min(1).max(10) });

route(
  floorsRouter, '/api/floors',
  { method: 'get', path: '/:code', tag: 'Floors', summary: 'Floor map: spots with geometry and live status', params: FloorCodeParams },
  async ({ params }) => {
    const floor = await prisma.floor.findUnique({ where: { code: params.code.toUpperCase() } });
    if (!floor) throw notFound('Floor');
    const [spots, states, allocations] = await Promise.all([
      prisma.spot.findMany({ where: { floorId: floor.id }, orderBy: [{ number: 'asc' }, { label: 'asc' }] }),
      computeSpotStates({ floorId: floor.id }),
      prisma.contractAllocation.findMany({
        where: { floorId: floor.id, contract: { status: ContractStatus.ACTIVE } },
        include: { contract: { select: { id: true, number: true, endDate: true, tenant: { select: { id: true, nameAr: true, nameEn: true, code: true } } } } },
      }),
    ]);
    const list = spots.map((s) => ({ id: s.id, label: s.label, number: s.number, type: s.type, geometry: s.geometry, geometrySource: s.geometrySource, isActive: s.isActive, notes: s.notes, ...states.get(s.id)! }));
    return {
      floor,
      stats: summarize(list),
      spots: list,
      allocations: allocations.map((a) => ({ id: a.id, quantity: a.quantity, kind: a.kind, contract: { ...a.contract, endDate: isoDate(a.contract.endDate) } })),
    };
  },
);

route(
  floorsRouter, '/api/floors',
  {
    method: 'patch', path: '/:code', tag: 'Floors', summary: 'Update floor metadata', auth: [Role.ADMIN, Role.OWNER], params: FloorCodeParams,
    body: z.object({ nameAr: z.string().min(1), nameEn: z.string().min(1), officialCapacity: z.number().int().min(0).nullable(), notes: z.string().nullable() }).partial(),
  },
  async ({ params, body, user }) => {
    const f = await prisma.floor.update({ where: { code: params.code.toUpperCase() }, data: body });
    await audit(user.id, 'UPDATE', 'Floor', f.id, body);
    return f;
  },
);

// ───────────── Spots ─────────────

route(
  spotsRouter, '/api/spots',
  {
    method: 'get', path: '/', tag: 'Spots', summary: 'Search spots (filter by floor, status, tenant)',
    query: z.object({
      floor: z.string().optional(),
      status: z.enum(['AVAILABLE', 'RENTED', 'EXPIRING', 'EXPIRED', 'INACTIVE']).optional(),
      type: z.nativeEnum(SpotType).optional(),
      tenantId: z.string().optional(),
      q: z.string().optional(),
    }),
  },
  async ({ query }) => {
    const where = {
      ...(query.floor ? { floor: { code: query.floor.toUpperCase() } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q ? { label: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    const [spots, states] = await Promise.all([
      prisma.spot.findMany({ where, include: { floor: { select: { code: true, nameAr: true, nameEn: true, level: true } } }, orderBy: [{ floor: { level: 'asc' } }, { number: 'asc' }, { label: 'asc' }] }),
      computeSpotStates(where),
    ]);
    return spots
      .map(({ geometry, ...s }) => ({ ...s, hasGeometry: Boolean(geometry), ...states.get(s.id)! }))
      .filter((s) => (!query.status || s.status === query.status) && (!query.tenantId || s.tenant?.id === query.tenantId));
  },
);

route(spotsRouter, '/api/spots', { method: 'get', path: '/:id', tag: 'Spots', summary: 'Spot details with full contract history', params: IdParams }, async ({ params }) => {
  const spot = await prisma.spot.findUnique({
    where: { id: params.id },
    include: {
      floor: { select: { code: true, nameAr: true, nameEn: true } },
      contractSpots: {
        include: { contract: { include: { tenant: { select: { id: true, nameAr: true, nameEn: true, code: true } } } } },
        orderBy: { contract: { startDate: 'desc' } },
      },
    },
  });
  if (!spot) throw notFound('Spot');
  const state = (await computeSpotStates({ id: spot.id })).get(spot.id)!;
  const { contractSpots, ...rest } = spot;
  return {
    ...rest,
    ...state,
    history: contractSpots.map((cs) => ({
      kind: cs.kind,
      annualPrice: cs.annualPrice,
      contract: { id: cs.contract.id, number: cs.contract.number, status: cs.contract.status, startDate: isoDate(cs.contract.startDate), endDate: isoDate(cs.contract.endDate), terminatedAt: cs.contract.terminatedAt },
      tenant: cs.contract.tenant,
    })),
  };
});

const SpotInput = z.object({
  floorCode: z.string(),
  label: z.string().min(1).max(10),
  type: z.nativeEnum(SpotType).optional(),
  geometry: Geometry.nullable().optional(),
  notes: z.string().nullable().optional(),
});

route(spotsRouter, '/api/spots', { method: 'post', path: '/', tag: 'Spots', summary: 'Create a spot (map editor)', auth: [Role.ADMIN, Role.OWNER, Role.STAFF], body: SpotInput }, async ({ body, user }) => {
  const floor = await prisma.floor.findUnique({ where: { code: body.floorCode.toUpperCase() } });
  if (!floor) throw notFound('Floor');
  const n = parseInt(body.label, 10);
  const spot = await prisma.spot.create({
    data: {
      floorId: floor.id, label: body.label, number: Number.isNaN(n) ? null : n,
      type: body.type ?? (floor.code === '1F' ? SpotType.VIP : floor.code === 'YARD' ? SpotType.OUTSIDE : floor.code === 'SHADED' ? SpotType.SHADED : SpotType.STANDARD),
      geometry: body.geometry ?? undefined, geometrySource: body.geometry ? 'manual' : null, notes: body.notes,
    },
  });
  await audit(user.id, 'CREATE', 'Spot', spot.id, body);
  return spot;
});

route(
  spotsRouter, '/api/spots',
  {
    method: 'patch', path: '/:id', tag: 'Spots', summary: 'Update spot (label, type, geometry, active flag)', auth: [Role.ADMIN, Role.OWNER, Role.STAFF], params: IdParams,
    body: z.object({ label: z.string().min(1).max(10), type: z.nativeEnum(SpotType), geometry: Geometry.nullable(), isActive: z.boolean(), notes: z.string().nullable() }).partial(),
  },
  async ({ params, body, user }) => {
    const data: Record<string, unknown> = { ...body };
    if (body.label) {
      const n = parseInt(body.label, 10);
      data.number = Number.isNaN(n) ? null : n;
    }
    if (body.geometry !== undefined) {
      data.geometry = body.geometry ?? Prisma.DbNull;
      data.geometrySource = body.geometry ? 'manual' : null;
    }
    const spot = await prisma.spot.update({ where: { id: params.id }, data });
    await audit(user.id, 'UPDATE', 'Spot', spot.id, body);
    return spot;
  },
);

route(
  spotsRouter, '/api/spots',
  {
    method: 'put', path: '/geometry/bulk', tag: 'Spots', summary: 'Save many spot geometries at once (map editor)', auth: [Role.ADMIN, Role.OWNER, Role.STAFF],
    body: z.object({ items: z.array(z.object({ id: z.string(), geometry: Geometry.nullable() })).min(1).max(2000) }),
  },
  async ({ body, user }) => {
    await prisma.$transaction(
      body.items.map((i) => prisma.spot.update({ where: { id: i.id }, data: { geometry: i.geometry ?? Prisma.DbNull, geometrySource: i.geometry ? 'manual' : null } })),
    );
    await audit(user.id, 'UPDATE', 'Spot', null, { bulkGeometry: body.items.length });
    return { updated: body.items.length };
  },
);

route(spotsRouter, '/api/spots', { method: 'delete', path: '/:id', tag: 'Spots', summary: 'Delete a spot without contract history', auth: [Role.ADMIN], params: IdParams }, async ({ params, user }) => {
  await prisma.spot.delete({ where: { id: params.id } });
  await audit(user.id, 'DELETE', 'Spot', params.id);
  return undefined;
});
