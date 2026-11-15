import dayjs from 'dayjs';
import { ContractStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createRouter, route } from '../lib/route';
import { today, addDays, daysBetween, isoDate } from '../lib/dates';
import { getSettings } from '../lib/settings';
import { computeSpotStates, summarize } from './spot-status';

export const dashboardRouter = createRouter();

route(dashboardRouter, '/api/dashboard', { method: 'get', path: '/', tag: 'Dashboard', summary: 'KPIs: occupancy (total & per floor), expiring contracts, revenue, vacancies' }, async () => {
  const settings = await getSettings();
  const now = today();
  const [floors, states, activeContracts, allocations, tenants, expiredContracts] = await Promise.all([
    prisma.floor.findMany({ orderBy: { level: 'asc' }, include: { spots: { select: { id: true } } } }),
    computeSpotStates(),
    prisma.contract.findMany({
      where: { status: ContractStatus.ACTIVE },
      include: {
        tenant: { select: { id: true, nameAr: true, nameEn: true, code: true, minSpots: true } },
        spots: { select: { annualPrice: true, spot: { select: { floorId: true } } } },
        allocations: { select: { floorId: true, quantity: true, annualPrice: true } },
      },
    }),
    prisma.contractAllocation.groupBy({ by: ['floorId'], _sum: { quantity: true }, where: { contract: { status: ContractStatus.ACTIVE } } }),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.contract.count({ where: { status: ContractStatus.EXPIRED, renewedBy: null } }),
  ]);

  const revenueByFloor = new Map<string, number>();
  for (const c of activeContracts) {
    c.spots.forEach((s) => revenueByFloor.set(s.spot.floorId, (revenueByFloor.get(s.spot.floorId) ?? 0) + Number(s.annualPrice)));
    c.allocations.forEach((a) => revenueByFloor.set(a.floorId, (revenueByFloor.get(a.floorId) ?? 0) + Number(a.annualPrice) * a.quantity));
  }

  const byFloor = floors.map((f) => {
    const st = summarize(f.spots.map((s) => states.get(s.id)!).filter(Boolean));
    const unnumbered = allocations.find((a) => a.floorId === f.id)?._sum.quantity ?? 0;
    const capacity = f.officialCapacity ?? st.total;
    const occupiedAll = st.occupied + unnumbered;
    return {
      code: f.code, nameAr: f.nameAr, nameEn: f.nameEn, kind: f.kind,
      ...st,
      unnumberedAllocated: unnumbered,
      capacity,
      occupancyRate: capacity ? Math.round((occupiedAll / capacity) * 1000) / 10 : 0,
      overbooked: Math.max(0, occupiedAll - capacity),
      // vacancy is bounded by capacity (open-yard parking is sold by quantity, not by drawn stall)
      vacant: Math.max(0, Math.min(st.AVAILABLE, capacity - occupiedAll)),
      revenue: Math.round(revenueByFloor.get(f.id) ?? 0),
    };
  });

  const totalCapacity = byFloor.reduce((a, f) => a + f.capacity, 0);
  const totalOccupied = byFloor.reduce((a, f) => a + f.occupied + f.unnumberedAllocated, 0);
  const all = summarize(states.values());
  const annualRevenue = activeContracts.reduce((a, c) => a + Number(c.annualAmount), 0);
  const threshold = addDays(now, settings.expiringThresholdDays);

  const expiring = activeContracts
    .filter((c) => c.endDate <= threshold)
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
    .slice(0, 20)
    .map((c) => ({
      id: c.id, number: c.number, tenant: c.tenant, endDate: isoDate(c.endDate), daysLeft: daysBetween(now, c.endDate),
      spots: c.spots.length + c.allocations.reduce((a, x) => a + x.quantity, 0), annualAmount: Number(c.annualAmount),
    }));

  // expiries per month: this month + the next 12 (an annual contract signed today ends in month 13)
  const timeline = Array.from({ length: 13 }, (_, i) => {
    const m = dayjs.utc(now).startOf('month').add(i, 'month');
    const inMonth = activeContracts.filter((c) => dayjs.utc(c.endDate).isSame(m, 'month'));
    return { month: m.format('YYYY-MM'), contracts: inMonth.length, amount: Math.round(inMonth.reduce((a, c) => a + Number(c.annualAmount), 0)) };
  });

  const tenantSpots = new Map<string, { count: number; min: number }>();
  activeContracts.forEach((c) => {
    const cur = tenantSpots.get(c.tenantId) ?? { count: 0, min: c.tenant.minSpots };
    cur.count += c.spots.length + c.allocations.reduce((a, x) => a + x.quantity, 0);
    tenantSpots.set(c.tenantId, cur);
  });
  const belowMinimum = [...tenantSpots.values()].filter((t) => t.count < t.min).length;

  return {
    generatedAt: new Date().toISOString(),
    currency: settings.currency,
    expiringThresholdDays: settings.expiringThresholdDays,
    totals: {
      capacity: totalCapacity,
      occupied: totalOccupied,
      occupancyRate: totalCapacity ? Math.round((totalOccupied / totalCapacity) * 1000) / 10 : 0,
      numbered: all,
      vacant: byFloor.reduce((a, f) => a + f.vacant, 0),
      tenants,
      activeContracts: activeContracts.length,
      expiringContracts: activeContracts.filter((c) => c.endDate <= threshold).length,
      expiredContracts,
      needsReview: activeContracts.filter((c) => c.needsReview).length,
      belowMinimum,
      annualRevenue: Math.round(annualRevenue),
      monthlyRevenue: Math.round(annualRevenue / 12),
      revenueAtRisk: Math.round(activeContracts.filter((c) => c.endDate <= addDays(now, 90)).reduce((a, c) => a + Number(c.annualAmount), 0)),
    },
    byFloor,
    expiring,
    timeline,
  };
});
