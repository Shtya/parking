import { ContractStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { today, daysBetween, isoDate } from '../lib/dates';
import { getSettings } from '../lib/settings';

export type SpotStatus = 'AVAILABLE' | 'RENTED' | 'EXPIRING' | 'EXPIRED' | 'INACTIVE';

export interface SpotState {
  status: SpotStatus;
  kind?: 'INCLUDED' | 'PAID';
  daysLeft?: number;
  contract?: { id: string; number: string; startDate: string; endDate: string; status: ContractStatus; needsReview: boolean };
  tenant?: { id: string; nameAr: string; nameEn: string | null; code: string | null };
}

/** Derives the live status of each spot from contracts (single source of truth = contracts). */
export async function computeSpotStates(where: Prisma.SpotWhereInput = {}): Promise<Map<string, SpotState>> {
  const [settings, spots] = await Promise.all([
    getSettings(),
    prisma.spot.findMany({
      where,
      select: {
        id: true,
        isActive: true,
        contractSpots: {
          where: { contract: { status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRED] } } },
          select: {
            kind: true,
            contract: {
              select: {
                id: true, number: true, startDate: true, endDate: true, status: true, needsReview: true,
                tenant: { select: { id: true, nameAr: true, nameEn: true, code: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  const now = today();
  const out = new Map<string, SpotState>();
  for (const s of spots) {
    if (!s.isActive) {
      out.set(s.id, { status: 'INACTIVE' });
      continue;
    }
    const sorted = [...s.contractSpots].sort((a, b) => b.contract.endDate.getTime() - a.contract.endDate.getTime());
    const active = sorted.find((cs) => cs.contract.status === ContractStatus.ACTIVE);
    const pick = active ?? sorted[0];
    if (!pick) {
      out.set(s.id, { status: 'AVAILABLE' });
      continue;
    }
    const c = pick.contract;
    const daysLeft = daysBetween(now, c.endDate);
    let status: SpotStatus;
    if (c.status === ContractStatus.EXPIRED || daysLeft < 0) status = 'EXPIRED';
    else if (daysLeft <= settings.expiringThresholdDays) status = 'EXPIRING';
    else status = 'RENTED';
    out.set(s.id, {
      status,
      kind: pick.kind,
      daysLeft,
      contract: { id: c.id, number: c.number, startDate: isoDate(c.startDate), endDate: isoDate(c.endDate), status: c.status, needsReview: c.needsReview },
      tenant: c.tenant,
    });
  }
  return out;
}

export function summarize(states: Iterable<SpotState>) {
  const counts: Record<SpotStatus, number> = { AVAILABLE: 0, RENTED: 0, EXPIRING: 0, EXPIRED: 0, INACTIVE: 0 };
  for (const s of states) counts[s.status]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const occupied = counts.RENTED + counts.EXPIRING;
  const usable = total - counts.INACTIVE;
  return { total, ...counts, occupied, occupancyRate: usable ? Math.round((occupied / usable) * 1000) / 10 : 0 };
}
