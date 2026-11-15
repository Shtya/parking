'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtNumber, tenantName } from '@/lib/format';
import type { Contract, Floor, Paged, Settings } from '@/lib/types';
import { Button } from '@/components/ui';
import { useI18n } from '@/components/providers';

/** Print-optimised report → browser "Save as PDF" (keeps Arabic shaping & RTL perfect). */
function PrintReport() {
  const { t, locale } = useI18n();
  const type = useSearchParams().get('type') ?? 'contracts';
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const contracts = useQuery({
    queryKey: ['print', type],
    enabled: type !== 'occupancy',
    queryFn: () => api<Paged<Contract>>('/contracts', { query: { pageSize: 500, ...(type === 'expiring' ? { expiringWithinDays: 60 } : { status: 'ACTIVE' }) } }),
  });
  const floors = useQuery({ queryKey: ['floors'], enabled: type === 'occupancy', queryFn: () => api<Floor[]>('/floors') });
  const ready = settings.data && (type === 'occupancy' ? floors.data : contracts.data);

  useEffect(() => {
    if (ready) setTimeout(() => window.print(), 400);
  }, [ready]);

  const title = type === 'occupancy' ? t.reports.occupancy : type === 'expiring' ? t.reports.expiring : t.reports.contracts;
  return (
    <div className="mx-auto max-w-5xl bg-white p-8 text-black">
      <div className="no-print mb-6 flex justify-end">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          {t.common.print}
        </Button>
      </div>
      <header className="mb-6 flex items-end justify-between border-b-2 border-teal-700 pb-3">
        <div>
          <p className="text-sm text-gray-500">{settings.data?.buildingName[locale]}</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <p className="text-xs text-gray-500">
          {t.reports.generated}: {fmtDate(new Date(), locale)}
        </p>
      </header>
      {!ready ? (
        <p>{t.common.loading}</p>
      ) : type === 'occupancy' ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              {[t.floors.spot, t.dashboard.capacity, t.status.AVAILABLE, t.status.RENTED, t.status.EXPIRING, t.status.EXPIRED, t.dashboard.unnumbered, '%'].map((h) => (
                <th key={h} className="border p-2 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.data!.map((f) => {
              const s = f.stats!;
              const cap = f.officialCapacity ?? s.total;
              const occ = s.occupied + (f.allocatedUnnumbered ?? 0);
              return (
                <tr key={f.code}>
                  <td className="border p-2 font-medium">
                    {f.code} — {locale === 'ar' ? f.nameAr : f.nameEn}
                  </td>
                  <td className="border p-2">{cap}</td>
                  <td className="border p-2">{s.AVAILABLE}</td>
                  <td className="border p-2">{s.RENTED}</td>
                  <td className="border p-2">{s.EXPIRING}</td>
                  <td className="border p-2">{s.EXPIRED}</td>
                  <td className="border p-2">{f.allocatedUnnumbered}</td>
                  <td className="border p-2 font-semibold">{fmtNumber(cap ? (occ / cap) * 100 : 0, locale, 1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              {[t.contracts.number, t.contracts.tenant, t.contracts.start, t.contracts.end, t.floors.daysLeft, t.contracts.spots, t.contracts.annual].map((h) => (
                <th key={h} className="border p-1.5 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.data!.items.map((c) => (
              <tr key={c.id} className="break-inside-avoid">
                <td className="border p-1.5 font-medium">{c.number}</td>
                <td className="border p-1.5">{tenantName(c.tenant, locale)}</td>
                <td className="border p-1.5 whitespace-nowrap">{fmtDate(c.startDate, locale)}</td>
                <td className="border p-1.5 whitespace-nowrap">{fmtDate(c.endDate, locale)}</td>
                <td className="border p-1.5">{c.daysLeft}</td>
                <td className="border p-1.5">{c.spotCount}</td>
                <td className="border p-1.5 whitespace-nowrap">{fmtMoney(c.annualAmount, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="border p-1.5" colSpan={5}>
                {t.common.total} ({contracts.data!.items.length})
              </td>
              <td className="border p-1.5">{contracts.data!.items.reduce((a, c) => a + (c.spotCount ?? 0), 0)}</td>
              <td className="border p-1.5">{fmtMoney(contracts.data!.items.reduce((a, c) => a + Number(c.annualAmount), 0), locale)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense>
      <PrintReport />
    </Suspense>
  );
}
