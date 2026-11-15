import { ContractStatus, Prisma, Role, SpotKind } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound, forbidden } from '../lib/errors';
import { annualEnd, addDays, toDateOnly, today, isoDate } from '../lib/dates';
import { getSettings } from '../lib/settings';
import type { AuthUser } from '../middleware/auth';
import { audit } from '../lib/audit';

type Tx = Prisma.TransactionClient;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ContractSpotInput = z.object({
  spotId: z.string(),
  kind: z.nativeEnum(SpotKind).default(SpotKind.PAID),
  annualPrice: z.number().min(0).optional(),
});
export const AllocationInput = z.object({
  floorCode: z.string(),
  quantity: z.number().int().min(1),
  kind: z.nativeEnum(SpotKind).default(SpotKind.PAID),
  annualPrice: z.number().min(0).optional(),
});

export const ContractInput = z
  .object({
    tenantId: z.string(),
    startDate: DATE,
    endDate: DATE.optional(),
    spots: z.array(ContractSpotInput).default([]),
    allocations: z.array(AllocationInput).default([]),
    annualAmount: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
    status: z.enum([ContractStatus.DRAFT, ContractStatus.ACTIVE]).default(ContractStatus.ACTIVE),
    /** ADMIN / OWNER only: allow fewer spots than the tenant minimum */
    allowBelowMinimum: z.boolean().default(false),
  })
  .openapi('ContractInput');
export type ContractInputT = z.infer<typeof ContractInput>;

export const RenewInput = z
  .object({
    startDate: DATE.optional(),
    endDate: DATE.optional(),
    spots: z.array(ContractSpotInput).optional(),
    allocations: z.array(AllocationInput).optional(),
    annualAmount: z.number().min(0).optional(),
    priceIncreasePercent: z.number().min(-100).max(500).optional(),
    notes: z.string().nullable().optional(),
    allowBelowMinimum: z.boolean().default(false),
  })
  .openapi('RenewInput');

export const TerminateInput = z.object({ date: DATE.optional(), reason: z.string().min(2) }).openapi('TerminateInput');

export async function nextContractNumber(tx: Tx, year: number) {
  const { contractNumberPrefix } = await getSettings();
  const prefix = `${contractNumberPrefix}-${year}-`;
  const last = await tx.contract.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/** No spot may belong to two ACTIVE/DRAFT contracts whose periods overlap. */
export async function assertSpotsFree(tx: Tx, spotIds: string[], start: Date, end: Date, excludeContractIds: string[] = []) {
  if (!spotIds.length) return;
  const clashes = await tx.contractSpot.findMany({
    where: {
      spotId: { in: spotIds },
      contractId: { notIn: excludeContractIds },
      contract: { status: { in: [ContractStatus.ACTIVE, ContractStatus.DRAFT] }, startDate: { lte: end }, endDate: { gte: start } },
    },
    include: { spot: { select: { label: true, floor: { select: { code: true } } } }, contract: { select: { number: true, tenant: { select: { nameAr: true } } } } },
  });
  if (clashes.length) {
    throw conflict(
      `${clashes.length} spot(s) are already rented in an overlapping contract`,
      clashes.map((c) => ({ spot: `${c.spot.floor.code}-${c.spot.label}`, contract: c.contract.number, tenant: c.contract.tenant.nameAr })),
      'SPOT_UNAVAILABLE',
    );
  }
}

async function buildLines(tx: Tx, spots: z.infer<typeof ContractSpotInput>[], allocations: z.infer<typeof AllocationInput>[], increase = 0) {
  const settings = await getSettings();
  const ids = [...new Set(spots.map((s) => s.spotId))];
  if (ids.length !== spots.length) throw badRequest('Duplicate spot in contract');
  const dbSpots = await tx.spot.findMany({ where: { id: { in: ids } } });
  if (dbSpots.length !== ids.length) throw badRequest('One or more spots do not exist');
  const inactive = dbSpots.filter((s) => !s.isActive);
  if (inactive.length) throw badRequest(`Spot(s) out of service: ${inactive.map((s) => s.label).join(', ')}`);
  const factor = 1 + increase / 100;
  const spotLines = spots.map((s) => {
    const spot = dbSpots.find((d) => d.id === s.spotId)!;
    const base = s.annualPrice ?? (s.kind === SpotKind.INCLUDED ? 0 : settings.pricing[spot.type]);
    return { spotId: s.spotId, kind: s.kind, annualPrice: new Prisma.Decimal(Math.round(base * factor * 100) / 100) };
  });
  const floors = await tx.floor.findMany({ where: { code: { in: allocations.map((a) => a.floorCode.toUpperCase()) } } });
  const allocLines = allocations.map((a) => {
    const floor = floors.find((f) => f.code === a.floorCode.toUpperCase());
    if (!floor) throw badRequest(`Unknown floor ${a.floorCode}`);
    const base = a.annualPrice ?? (a.kind === SpotKind.INCLUDED ? 0 : settings.pricing.OUTSIDE);
    return { floorId: floor.id, quantity: a.quantity, kind: a.kind, annualPrice: new Prisma.Decimal(Math.round(base * factor * 100) / 100) };
  });
  const total = spotLines.reduce((a, l) => a + Number(l.annualPrice), 0) + allocLines.reduce((a, l) => a + Number(l.annualPrice) * l.quantity, 0);
  const count = spotLines.length + allocLines.reduce((a, l) => a + l.quantity, 0);
  return { spotLines, allocLines, total: Math.round(total * 100) / 100, count };
}

async function assertMinimum(tx: Tx, tenantId: string, count: number, allowBelow: boolean, user: AuthUser) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound('Tenant');
  if (count < tenant.minSpots) {
    if (!allowBelow) throw badRequest(`Each office must rent at least ${tenant.minSpots} spots (got ${count})`, { minSpots: tenant.minSpots, count }, 'BELOW_MINIMUM');
    if (user.role === Role.STAFF) throw forbidden('Only ADMIN or OWNER can approve contracts below the minimum');
  }
  return tenant;
}

const TX = { timeout: 30_000, maxWait: 10_000 };

export async function createContract(input: ContractInputT, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const start = toDateOnly(input.startDate);
    const end = input.endDate ? toDateOnly(input.endDate) : annualEnd(start);
    if (end <= start) throw badRequest('End date must be after start date');
    const lines = await buildLines(tx, input.spots, input.allocations);
    await assertMinimum(tx, input.tenantId, lines.count, input.allowBelowMinimum, user);
    await assertSpotsFree(tx, lines.spotLines.map((l) => l.spotId), start, end);
    const contract = await tx.contract.create({
      data: {
        number: await nextContractNumber(tx, start.getUTCFullYear()),
        tenantId: input.tenantId, startDate: start, endDate: end, status: input.status,
        annualAmount: input.annualAmount ?? lines.total, notes: input.notes,
        spots: { create: lines.spotLines }, allocations: { create: lines.allocLines },
      },
    });
    await audit(user.id, 'CREATE', 'Contract', contract.id, { number: contract.number, spots: lines.spotLines.length });
    return contract;
  }, TX);
}

export async function renewContract(id: string, input: z.infer<typeof RenewInput>, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.contract.findUnique({ where: { id }, include: { spots: true, allocations: { include: { floor: true } }, renewedBy: true } });
    if (!old) throw notFound('Contract');
    if (old.renewedBy) throw conflict(`Contract already renewed by ${old.renewedBy.number}`);
    if (!([ContractStatus.ACTIVE, ContractStatus.EXPIRED] as ContractStatus[]).includes(old.status)) throw badRequest(`Cannot renew a ${old.status} contract`);
    const start = input.startDate ? toDateOnly(input.startDate) : addDays(old.endDate, 1);
    const end = input.endDate ? toDateOnly(input.endDate) : annualEnd(start);
    if (end <= start) throw badRequest('End date must be after start date');
    const spots = input.spots ?? old.spots.map((s) => ({ spotId: s.spotId, kind: s.kind, annualPrice: Number(s.annualPrice) }));
    const allocations = input.allocations ?? old.allocations.map((a) => ({ floorCode: a.floor.code, quantity: a.quantity, kind: a.kind, annualPrice: Number(a.annualPrice) }));
    const lines = await buildLines(tx, spots, allocations, input.priceIncreasePercent ?? 0);
    await assertMinimum(tx, old.tenantId, lines.count, input.allowBelowMinimum, user);
    await assertSpotsFree(tx, lines.spotLines.map((l) => l.spotId), start, end, [old.id]);
    const created = await tx.contract.create({
      data: {
        number: await nextContractNumber(tx, start.getUTCFullYear()),
        tenantId: old.tenantId, startDate: start, endDate: end, status: ContractStatus.ACTIVE,
        annualAmount: input.annualAmount ?? lines.total, notes: input.notes ?? old.notes, renewedFromId: old.id,
        spots: { create: lines.spotLines }, allocations: { create: lines.allocLines },
      },
    });
    await tx.contract.update({ where: { id: old.id }, data: { status: ContractStatus.RENEWED } });
    await audit(user.id, 'RENEW', 'Contract', old.id, { from: old.number, to: created.number });
    return created;
  }, TX);
}

export async function terminateContract(id: string, input: z.infer<typeof TerminateInput>, user: AuthUser) {
  const c = await prisma.contract.findUnique({ where: { id } });
  if (!c) throw notFound('Contract');
  if (!([ContractStatus.ACTIVE, ContractStatus.DRAFT] as ContractStatus[]).includes(c.status)) throw badRequest(`Cannot terminate a ${c.status} contract`);
  const date = input.date ? toDateOnly(input.date) : today();
  const updated = await prisma.contract.update({
    where: { id },
    data: { status: ContractStatus.TERMINATED, terminatedAt: date, terminationReason: input.reason, endDate: date < c.endDate ? date : c.endDate },
  });
  await audit(user.id, 'TERMINATE', 'Contract', id, { reason: input.reason, date: isoDate(date) });
  return updated;
}

export async function updateContract(id: string, input: Partial<ContractInputT> & { needsReview?: boolean }, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.contract.findUnique({ where: { id } });
    if (!c) throw notFound('Contract');
    const editable = ([ContractStatus.ACTIVE, ContractStatus.DRAFT] as ContractStatus[]).includes(c.status);
    const data: Prisma.ContractUpdateInput = {};
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.needsReview !== undefined) data.needsReview = input.needsReview;
    if (input.status && c.status === ContractStatus.DRAFT) data.status = input.status;
    const start = input.startDate ? toDateOnly(input.startDate) : c.startDate;
    const end = input.endDate ? toDateOnly(input.endDate) : input.startDate ? annualEnd(start) : c.endDate;
    if (input.startDate || input.endDate) {
      if (!editable) throw badRequest('Dates can only be changed on active or draft contracts');
      if (end <= start) throw badRequest('End date must be after start date');
      data.startDate = start;
      data.endDate = end;
    }
    if (input.spots || input.allocations) {
      if (!editable) throw badRequest('Spots can only be changed on active or draft contracts');
      const current = await tx.contract.findUniqueOrThrow({ where: { id }, include: { spots: true, allocations: { include: { floor: true } } } });
      const spots = input.spots ?? current.spots.map((s) => ({ spotId: s.spotId, kind: s.kind, annualPrice: Number(s.annualPrice) }));
      const allocations = input.allocations ?? current.allocations.map((a) => ({ floorCode: a.floor.code, quantity: a.quantity, kind: a.kind, annualPrice: Number(a.annualPrice) }));
      const lines = await buildLines(tx, spots, allocations);
      await assertMinimum(tx, c.tenantId, lines.count, input.allowBelowMinimum ?? false, user);
      await assertSpotsFree(tx, lines.spotLines.map((l) => l.spotId), start, end, [id]);
      await tx.contractSpot.deleteMany({ where: { contractId: id } });
      await tx.contractAllocation.deleteMany({ where: { contractId: id } });
      data.spots = { create: lines.spotLines };
      data.allocations = { create: lines.allocLines };
      data.annualAmount = input.annualAmount ?? lines.total;
    } else if (input.annualAmount !== undefined) data.annualAmount = input.annualAmount;
    const updated = await tx.contract.update({ where: { id }, data });
    await audit(user.id, 'UPDATE', 'Contract', id, input);
    return updated;
  }, TX);
}

/** Marks ACTIVE contracts past their end date as EXPIRED. Returns affected contract ids. */
export async function expireOverdueContracts() {
  const overdue = await prisma.contract.findMany({ where: { status: ContractStatus.ACTIVE, endDate: { lt: today() } }, select: { id: true } });
  if (overdue.length) await prisma.contract.updateMany({ where: { id: { in: overdue.map((o) => o.id) } }, data: { status: ContractStatus.EXPIRED } });
  return overdue.map((o) => o.id);
}
