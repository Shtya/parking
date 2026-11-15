import ExcelJS from 'exceljs';
import { ContractStatus, Role } from '@prisma/client';
import { z } from '../lib/zod';
import { prisma } from '../lib/prisma';
import { createRouter, route } from '../lib/route';
import { isoDate, today, addDays, daysBetween } from '../lib/dates';
import { getSettings } from '../lib/settings';
import type { ApiResponse } from '../lib/http';
import { computeSpotStates } from './spot-status';

export const reportsRouter = createRouter();
const BASE = '/api/reports';
const ROLES = [Role.ADMIN, Role.OWNER, Role.STAFF];
const Lang = z.object({ lang: z.enum(['ar', 'en']).default('ar') });

type Col = { key: string; ar: string; en: string; width?: number; fmt?: string };

async function sendWorkbook(res: ApiResponse, fileName: string, sheetTitle: { ar: string; en: string }, cols: Col[], rows: Record<string, unknown>[], lang: 'ar' | 'en') {
  const settings = await getSettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Parking Management System';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetTitle[lang].slice(0, 31), { views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 3 }] });
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = `${settings.buildingName[lang]} — ${sheetTitle[lang]}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell(2, 1).value = `${lang === 'ar' ? 'تاريخ التقرير' : 'Generated'}: ${isoDate(new Date())}`;
  ws.getCell(2, 1).font = { color: { argb: 'FF6B7280' } };
  const header = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c[lang];
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getColumn(i + 1).width = c.width ?? 16;
    if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt;
  });
  header.height = 22;
  rows.forEach((r) => ws.addRow(cols.map((c) => r[c.key] ?? '')));
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: cols.length } };
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('content-disposition', `attachment; filename="${fileName}-${isoDate(new Date())}.xlsx"`);
  res.send(new Uint8Array(buffer as ArrayBuffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

const STATUS_AR: Record<string, string> = { AVAILABLE: 'متاح', RENTED: 'مؤجر', EXPIRING: 'قارب على الانتهاء', EXPIRED: 'منتهي', INACTIVE: 'خارج الخدمة', ACTIVE: 'ساري', RENEWED: 'مُجدد', TERMINATED: 'مُنهى', DRAFT: 'مسودة' };
const KIND_AR: Record<string, string> = { INCLUDED: 'ضمن عقد المكتب', PAID: 'مدفوع' };
const tr = (lang: 'ar' | 'en', map: Record<string, string>, v?: string | null) => (v ? (lang === 'ar' ? map[v] ?? v : v) : '');

route(reportsRouter, BASE, { method: 'get', path: '/spots.xlsx', tag: 'Reports', summary: 'All spots with status & tenant (Excel)', auth: ROLES, query: Lang.extend({ floor: z.string().optional() }), produces: 'xlsx' }, async ({ res, query }) => {
  const where = query.floor ? { floor: { code: query.floor.toUpperCase() } } : {};
  const [spots, states] = await Promise.all([
    prisma.spot.findMany({ where, include: { floor: true }, orderBy: [{ floor: { level: 'asc' } }, { number: 'asc' }, { label: 'asc' }] }),
    computeSpotStates(where),
  ]);
  const rows = spots.map((s) => {
    const st = states.get(s.id)!;
    return {
      floor: query.lang === 'ar' ? s.floor.nameAr : s.floor.nameEn, label: s.label, type: s.type, status: tr(query.lang, STATUS_AR, st.status),
      tenant: st.tenant ? (query.lang === 'ar' ? st.tenant.nameAr : st.tenant.nameEn ?? st.tenant.nameAr) : '', contract: st.contract?.number,
      start: st.contract?.startDate, end: st.contract?.endDate, daysLeft: st.daysLeft, kind: tr(query.lang, KIND_AR, st.kind), mapped: s.geometry ? '✓' : '—',
    };
  });
  await sendWorkbook(res, 'spots', { ar: 'تقرير الأماكن', en: 'Spots report' }, [
    { key: 'floor', ar: 'الطابق', en: 'Floor', width: 18 }, { key: 'label', ar: 'رقم المكان', en: 'Spot', width: 10 }, { key: 'type', ar: 'النوع', en: 'Type', width: 12 },
    { key: 'status', ar: 'الحالة', en: 'Status', width: 18 }, { key: 'tenant', ar: 'المستأجر', en: 'Tenant', width: 40 }, { key: 'contract', ar: 'رقم العقد', en: 'Contract', width: 16 },
    { key: 'start', ar: 'البداية', en: 'Start', width: 12 }, { key: 'end', ar: 'الانتهاء', en: 'End', width: 12 }, { key: 'daysLeft', ar: 'الأيام المتبقية', en: 'Days left', width: 12 },
    { key: 'kind', ar: 'نوع الإيجار', en: 'Kind', width: 16 }, { key: 'mapped', ar: 'على الخريطة', en: 'On map', width: 10 },
  ], rows, query.lang);
});

route(
  reportsRouter, BASE,
  {
    method: 'get', path: '/contracts.xlsx', tag: 'Reports', summary: 'Contracts (Excel); expiringWithinDays filters upcoming expiries', auth: ROLES, produces: 'xlsx',
    query: Lang.extend({ status: z.nativeEnum(ContractStatus).optional(), expiringWithinDays: z.coerce.number().int().min(0).optional() }),
  },
  async ({ res, query }) => {
    const now = today();
    const contracts = await prisma.contract.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.expiringWithinDays !== undefined ? { status: ContractStatus.ACTIVE, endDate: { lte: addDays(now, query.expiringWithinDays) } } : {}),
      },
      include: { tenant: true, spots: { include: { spot: { include: { floor: true } } } }, allocations: { include: { floor: true } } },
      orderBy: { endDate: 'asc' },
    });
    const rows = contracts.map((c) => {
      const byFloor = new Map<string, string[]>();
      c.spots.forEach((s) => byFloor.set(s.spot.floor.code, [...(byFloor.get(s.spot.floor.code) ?? []), s.spot.label]));
      return {
        number: c.number, tenant: query.lang === 'ar' ? c.tenant.nameAr : c.tenant.nameEn ?? c.tenant.nameAr, units: c.tenant.officeUnits, status: tr(query.lang, STATUS_AR, c.status),
        start: isoDate(c.startDate), end: isoDate(c.endDate), daysLeft: daysBetween(now, c.endDate),
        count: c.spots.length + c.allocations.reduce((a, x) => a + x.quantity, 0),
        spots: [...[...byFloor.entries()].map(([f, l]) => `${f}: ${l.join(',')}`), ...c.allocations.map((a) => `${a.floor.code}: ×${a.quantity}`)].join(' | '),
        amount: Number(c.annualAmount), review: c.needsReview ? '⚠' : '',
      };
    });
    await sendWorkbook(res, 'contracts', { ar: 'تقرير العقود', en: 'Contracts report' }, [
      { key: 'number', ar: 'رقم العقد', en: 'Contract', width: 16 }, { key: 'tenant', ar: 'المستأجر', en: 'Tenant', width: 40 }, { key: 'units', ar: 'الوحدات', en: 'Units', width: 20 },
      { key: 'status', ar: 'الحالة', en: 'Status', width: 14 }, { key: 'start', ar: 'البداية', en: 'Start', width: 12 }, { key: 'end', ar: 'الانتهاء', en: 'End', width: 12 },
      { key: 'daysLeft', ar: 'الأيام المتبقية', en: 'Days left', width: 12 }, { key: 'count', ar: 'عدد الأماكن', en: 'Spots', width: 10 }, { key: 'spots', ar: 'الأماكن', en: 'Spot numbers', width: 60 },
      { key: 'amount', ar: 'القيمة السنوية', en: 'Annual amount', width: 16, fmt: '#,##0.00' }, { key: 'review', ar: 'تحتاج مراجعة', en: 'Review', width: 10 },
    ], rows, query.lang);
  },
);

route(reportsRouter, BASE, { method: 'get', path: '/tenants.xlsx', tag: 'Reports', summary: 'Tenants with spot counts (Excel)', auth: ROLES, query: Lang, produces: 'xlsx' }, async ({ res, query }) => {
  const tenants = await prisma.tenant.findMany({
    include: { contacts: { where: { isPrimary: true }, take: 1 }, contracts: { where: { status: ContractStatus.ACTIVE }, include: { _count: { select: { spots: true } }, allocations: true } } },
    orderBy: { nameAr: 'asc' },
  });
  const rows = tenants.map((t) => {
    const count = t.contracts.reduce((a, c) => a + c._count.spots + c.allocations.reduce((x, y) => x + y.quantity, 0), 0);
    return {
      name: query.lang === 'ar' ? t.nameAr : t.nameEn ?? t.nameAr, code: t.code, units: t.officeUnits, contact: t.contacts[0]?.name, phone: t.contacts[0]?.phone ?? t.phone,
      email: t.contacts[0]?.email ?? t.email, spots: count, min: t.minSpots, below: count < t.minSpots ? '⚠' : '', amount: t.contracts.reduce((a, c) => a + Number(c.annualAmount), 0),
    };
  });
  await sendWorkbook(res, 'tenants', { ar: 'تقرير المستأجرين', en: 'Tenants report' }, [
    { key: 'name', ar: 'المستأجر', en: 'Tenant', width: 40 }, { key: 'code', ar: 'الرمز', en: 'Code', width: 12 }, { key: 'units', ar: 'الوحدات', en: 'Units', width: 20 },
    { key: 'contact', ar: 'جهة الاتصال', en: 'Contact', width: 20 }, { key: 'phone', ar: 'الجوال', en: 'Phone', width: 16 }, { key: 'email', ar: 'البريد', en: 'Email', width: 26 },
    { key: 'spots', ar: 'عدد الأماكن', en: 'Spots', width: 10 }, { key: 'min', ar: 'الحد الأدنى', en: 'Minimum', width: 10 }, { key: 'below', ar: 'أقل من الحد', en: 'Below min', width: 10 },
    { key: 'amount', ar: 'القيمة السنوية', en: 'Annual amount', width: 16, fmt: '#,##0.00' },
  ], rows, query.lang);
});

route(reportsRouter, BASE, { method: 'get', path: '/occupancy.xlsx', tag: 'Reports', summary: 'Occupancy per floor (Excel)', auth: ROLES, query: Lang, produces: 'xlsx' }, async ({ res, query }) => {
  const [floors, states, alloc] = await Promise.all([
    prisma.floor.findMany({ orderBy: { level: 'asc' }, include: { spots: { select: { id: true } } } }),
    computeSpotStates(),
    prisma.contractAllocation.groupBy({ by: ['floorId'], _sum: { quantity: true }, where: { contract: { status: ContractStatus.ACTIVE } } }),
  ]);
  const rows = floors.map((f) => {
    const s = f.spots.map((x) => states.get(x.id)!);
    const c = (k: string) => s.filter((x) => x.status === k).length;
    const un = alloc.find((a) => a.floorId === f.id)?._sum.quantity ?? 0;
    const cap = f.officialCapacity ?? s.length;
    const occ = c('RENTED') + c('EXPIRING') + un;
    return { floor: query.lang === 'ar' ? f.nameAr : f.nameEn, capacity: cap, mapped: s.length, available: c('AVAILABLE'), rented: c('RENTED'), expiring: c('EXPIRING'), expired: c('EXPIRED'), unnumbered: un, rate: cap ? occ / cap : 0 };
  });
  await sendWorkbook(res, 'occupancy', { ar: 'تقرير الإشغال', en: 'Occupancy report' }, [
    { key: 'floor', ar: 'الطابق', en: 'Floor', width: 22 }, { key: 'capacity', ar: 'السعة', en: 'Capacity', width: 10 }, { key: 'mapped', ar: 'أماكن مرقمة', en: 'Numbered', width: 12 },
    { key: 'available', ar: 'متاح', en: 'Available', width: 10 }, { key: 'rented', ar: 'مؤجر', en: 'Rented', width: 10 }, { key: 'expiring', ar: 'قارب على الانتهاء', en: 'Expiring', width: 14 },
    { key: 'expired', ar: 'منتهي', en: 'Expired', width: 10 }, { key: 'unnumbered', ar: 'مخصص بدون رقم', en: 'Unnumbered', width: 14 }, { key: 'rate', ar: 'نسبة الإشغال', en: 'Occupancy', width: 12, fmt: '0.0%' },
  ], rows, query.lang);
});
