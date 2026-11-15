import { ContractStatus, ImportStatus, Prisma, SpotType, type Floor } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, badRequest, notFound } from '../../lib/errors';
import { annualEnd, toDateOnly, today, isoDate } from '../../lib/dates';
import { getSettings } from '../../lib/settings';
import { audit } from '../../lib/audit';
import { nextContractNumber } from '../contracts.service';
import { parseStatement, type ParseResult, type ImportIssue } from './parser';

export const typeForFloor = (code: string): SpotType =>
  code === '1F' ? SpotType.VIP : code === 'YARD' ? SpotType.OUTSIDE : code === 'SHADED' ? SpotType.SHADED : SpotType.STANDARD;

/** Parse + store a preview batch (nothing written to business tables). */
export async function createPreview(buffer: Buffer, fileName: string, userId?: string) {
  let parsed: ParseResult;
  try {
    parsed = await parseStatement(buffer);
  } catch (err) {
    throw badRequest(`Could not read the Excel file: ${(err as Error).message}`);
  }
  // spots referenced by the sheet but missing from the drawings
  const floors = await prisma.floor.findMany({ include: { spots: { select: { label: true } } } });
  const extra: ImportIssue[] = [];
  const missingByFloor: Record<string, string[]> = {};
  for (const t of parsed.tenants) {
    for (const s of t.spots) {
      const f = floors.find((x) => x.code === s.floorCode);
      if (!f) continue;
      if (!f.spots.some((x) => x.label === s.label)) (missingByFloor[s.floorCode] ??= []).push(s.label);
    }
  }
  for (const [code, labels] of Object.entries(missingByFloor)) {
    extra.push({
      severity: 'info',
      code: 'SPOT_NOT_IN_DRAWING',
      message:
        code === 'SHADED'
          ? `${labels.length} shaded yard spot(s) have no drawing — they will be created and shown in the grid view (place them later with the map editor).`
          : `${code}: ${labels.length} spot number(s) not found in the drawing (${[...new Set(labels)].slice(0, 15).join(', ')}${labels.length > 15 ? '…' : ''}) — they will be created as "unplaced".`,
    });
  }
  const issues = [...parsed.issues, ...extra];
  const activeContracts = await prisma.contract.count({ where: { status: { in: [ContractStatus.ACTIVE, ContractStatus.DRAFT] } } });
  const summary = { ...parsed.summary, existingActiveContracts: activeContracts, info: issues.filter((i) => i.severity === 'info').length };
  const batch = await prisma.importBatch.create({
    data: {
      fileName,
      status: parsed.summary.errors ? ImportStatus.FAILED : ImportStatus.PREVIEW,
      summary: summary as Prisma.InputJsonValue,
      issues: issues as unknown as Prisma.InputJsonValue,
      payload: parsed as unknown as Prisma.InputJsonValue,
      createdById: userId,
    },
  });
  return { id: batch.id, status: batch.status, fileName, summary, issues, tenants: parsed.tenants, units: parsed.units.length, floorCapacities: parsed.floorCapacities };
}

export interface CommitOptions {
  startDate?: string;
  replaceExisting?: boolean;
}

/** Applies a previewed batch: tenants, contracts (needsReview), spots, allocations, office units, capacities. */
export async function commitImport(batchId: string, options: CommitOptions, userId?: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Import batch');
  if (batch.status !== ImportStatus.PREVIEW) throw badRequest(`Batch is ${batch.status}, only PREVIEW batches can be committed`);
  const parsed = batch.payload as unknown as ParseResult;
  const settings = await getSettings();
  const start = options.startDate ? toDateOnly(options.startDate) : today();
  const end = annualEnd(start);

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.contract.count({ where: { status: { in: [ContractStatus.ACTIVE, ContractStatus.DRAFT] } } });
      if (existing && !options.replaceExisting)
        throw conflict(`${existing} active contract(s) already exist. Re-run with "replace existing" to terminate them first.`, undefined, 'ACTIVE_CONTRACTS_EXIST');
      let terminated = 0;
      if (existing) {
        const r = await tx.contract.updateMany({
          where: { status: { in: [ContractStatus.ACTIVE, ContractStatus.DRAFT] } },
          data: { status: ContractStatus.TERMINATED, terminatedAt: today(), terminationReason: `Replaced by import ${batch.fileName}` },
        });
        terminated = r.count;
      }

      const floors = new Map<string, Floor>((await tx.floor.findMany()).map((f) => [f.code, f]));
      for (const [code, cap] of Object.entries(parsed.floorCapacities)) {
        if (floors.has(code) && cap) await tx.floor.update({ where: { code }, data: { officialCapacity: cap } });
      }

      // ensure every referenced spot exists
      const spotIndex = new Map<string, { id: string; type: SpotType }>();
      for (const s of await tx.spot.findMany({ select: { id: true, label: true, type: true, floor: { select: { code: true } } } })) spotIndex.set(`${s.floor.code}#${s.label}`, s);
      const toCreate: Prisma.SpotCreateManyInput[] = [];
      for (const t of parsed.tenants)
        for (const s of t.spots) {
          const floor = floors.get(s.floorCode);
          if (!floor || spotIndex.has(`${s.floorCode}#${s.label}`) || toCreate.some((c) => c.floorId === floor.id && c.label === s.label)) continue;
          toCreate.push({ floorId: floor.id, label: s.label, number: parseInt(s.label, 10) || null, type: typeForFloor(s.floorCode), notes: 'Created by import — not in drawing' });
        }
      if (toCreate.length) {
        await tx.spot.createMany({ data: toCreate });
        for (const s of await tx.spot.findMany({
          where: { floorId: { in: [...new Set(toCreate.map((c) => c.floorId))] } },
          select: { id: true, label: true, type: true, floor: { select: { code: true } } },
        }))
          spotIndex.set(`${s.floor.code}#${s.label}`, s);
      }

      let tenantsCreated = 0;
      let tenantsUpdated = 0;
      let contracts = 0;
      const usedCodes = new Set((await tx.tenant.findMany({ where: { code: { not: null } }, select: { code: true } })).map((t) => t.code!));
      for (const t of parsed.tenants) {
        let tenant = await tx.tenant.findFirst({ where: { nameAr: t.nameAr } });
        if (tenant) {
          tenant = await tx.tenant.update({ where: { id: tenant.id }, data: { officeUnits: t.officeUnits ?? tenant.officeUnits, status: 'ACTIVE' } });
          tenantsUpdated++;
        } else {
          let code = t.code;
          if (code && usedCodes.has(code)) code = null;
          if (code) usedCodes.add(code);
          tenant = await tx.tenant.create({ data: { nameAr: t.nameAr, nameEn: t.nameEn, code, officeUnits: t.officeUnits, minSpots: settings.minSpotsPerTenant } });
          tenantsCreated++;
        }
        const spotLines = t.spots
          .map((s) => {
            const spot = spotIndex.get(`${s.floorCode}#${s.label}`);
            if (!spot) return null;
            return { spotId: spot.id, kind: s.kind, annualPrice: new Prisma.Decimal(s.kind === 'INCLUDED' ? 0 : settings.pricing[spot.type]) };
          })
          .filter(Boolean) as { spotId: string; kind: 'INCLUDED' | 'PAID'; annualPrice: Prisma.Decimal }[];
        const allocLines = t.allocations
          .filter((a) => floors.has(a.floorCode))
          .map((a) => ({
            floorId: floors.get(a.floorCode)!.id, quantity: a.quantity, kind: a.kind,
            annualPrice: new Prisma.Decimal(a.kind === 'INCLUDED' ? 0 : settings.pricing[typeForFloor(a.floorCode)]),
          }));
        if (!spotLines.length && !allocLines.length) continue;
        const amount = spotLines.reduce((a, l) => a + Number(l.annualPrice), 0) + allocLines.reduce((a, l) => a + Number(l.annualPrice) * l.quantity, 0);
        await tx.contract.create({
          data: {
            number: await nextContractNumber(tx, start.getUTCFullYear()),
            tenantId: tenant.id, startDate: start, endDate: end, status: ContractStatus.ACTIVE,
            annualAmount: amount, needsReview: true, importBatchId: batch.id,
            notes: `Imported from "${batch.fileName}" (row ${t.rows.join(', ')}). Prices = default tariff; dates = import date. Please review.`,
            spots: { create: spotLines }, allocations: { create: allocLines },
          },
        });
        contracts++;
      }

      for (const u of parsed.units) {
        await tx.officeUnit.upsert({
          where: { floorLabel_unitNo: { floorLabel: u.floorLabel, unitNo: u.unitNo } },
          create: { ...u },
          update: { area: u.area, parkingByContract: u.parkingByContract, parkingByArea: u.parkingByArea, status: u.status },
        });
      }

      await tx.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.COMMITTED, committedAt: new Date() } });
      return { tenantsCreated, tenantsUpdated, contracts, spotsCreated: toCreate.length, units: parsed.units.length, terminated, startDate: isoDate(start), endDate: isoDate(end) };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  await audit(userId, 'IMPORT', 'ImportBatch', batch.id, result);
  return result;
}
