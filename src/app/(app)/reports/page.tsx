'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, FileSpreadsheet, LayoutGrid, Printer, SquareParking, Users } from 'lucide-react';
import { download } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { useI18n } from '@/components/providers';

export default function ReportsPage() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const reports: { key: string; path: string; extra?: Record<string, string>; title: string; icon: typeof SquareParking; print: string | null }[] = [
    { key: 'spots', path: '/reports/spots.xlsx', title: t.reports.spots, icon: SquareParking, print: null },
    { key: 'contracts', path: '/reports/contracts.xlsx', title: t.reports.contracts, icon: FileSpreadsheet, print: 'contracts' },
    { key: 'expiring', path: '/reports/contracts.xlsx', extra: { expiringWithinDays: '60' }, title: t.reports.expiring, icon: CalendarClock, print: 'expiring' },
    { key: 'tenants', path: '/reports/tenants.xlsx', title: t.reports.tenants, icon: Users, print: null },
    { key: 'occupancy', path: '/reports/occupancy.xlsx', title: t.reports.occupancy, icon: LayoutGrid, print: 'occupancy' },
  ];
  const get = async (key: string, path: string, lang: string, extra?: Record<string, string>) => {
    setBusy(`${key}-${lang}`);
    try {
      await download(path, { lang, ...(extra ?? {}) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <PageHeader title={t.reports.title} subtitle={t.reports.subtitle} />
      <ul className="divide-y divide-border/70 overflow-hidden rounded-sheet bg-surface shadow-e1">
        {reports.map((r) => (
          <li key={r.key} className="lit flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-6">
            <r.icon className="size-5 shrink-0 text-accent" strokeWidth={1.9} aria-hidden />
            <p className="min-w-[12rem] flex-1 text-[15px] font-bold">{r.title}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={busy === `${r.key}-ar`} onClick={() => get(r.key, r.path, 'ar', r.extra)}>
                {t.reports.excelAr}
              </Button>
              <Button size="sm" variant="outline" loading={busy === `${r.key}-en`} onClick={() => get(r.key, r.path, 'en', r.extra)}>
                {t.reports.excelEn}
              </Button>
              {r.print && (
                <Link href={`/print?type=${r.print}`} target="_blank">
                  <Button size="sm" variant="ghost">
                    <Printer className="size-3.5" />
                    {t.common.print}
                  </Button>
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
