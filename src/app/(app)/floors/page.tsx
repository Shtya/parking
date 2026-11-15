'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtNumber } from '@/lib/format';
import type { Floor } from '@/lib/types';
import { ErrorState, PageHeader, Skeleton, StatusSwatch } from '@/components/ui';
import { useI18n } from '@/components/providers';
import { LevelStack, occupancyOf } from '@/components/level-stack';
import { OccupancyRate } from '@/components/occupancy-rate';

export default function FloorsPage() {
  const { t, locale } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const totals = data?.reduce(
    (a, f) => {
      const o = occupancyOf(f);
      return { cap: a.cap + o.cap, occ: a.occ + o.occ, spots: a.spots + (f.stats?.total ?? 0) };
    },
    { cap: 0, occ: 0, spots: 0 },
  );
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(280px,340px)]">
      <div>
        <PageHeader title={t.floors.title} subtitle={t.floors.overviewSubtitle} />
        {isLoading || !data ? <Skeleton className="h-[640px] rounded-sheet" /> : <LevelStack floors={data} large className="max-w-3xl" />}
      </div>
      {totals && (
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[14px] font-bold text-muted">{t.floors.wholeBuilding}</p>
          <div className="mt-2">
            <OccupancyRate value={totals.cap ? (totals.occ / totals.cap) * 100 : 0} label={t.dashboard.occupancy} />
          </div>
          <p className="mt-3 text-[15px] text-muted">
            <b className="font-sign text-fg">{fmtNumber(totals.occ, locale)}</b> {t.dashboard.allocatedOf} <b className="font-sign text-fg">{fmtNumber(totals.cap, locale)}</b> {t.dashboard.spacesAllocated}.{' '}
            <b className="font-sign text-fg">{fmtNumber(totals.spots, locale)}</b> {t.floors.spotsOnPlans}.
          </p>
          <ul className="mt-6 space-y-2.5 text-[14px]">
            {(['AVAILABLE', 'RENTED', 'EXPIRING', 'EXPIRED', 'INACTIVE'] as const).map((s) => (
              <li key={s} className="flex items-center gap-2.5">
                <StatusSwatch status={s} size={16} />
                <span className="flex-1">{t.status[s]}</span>
                <b className="font-sign">{fmtNumber(data?.reduce((a, f) => a + (f.stats?.[s] ?? 0), 0), locale)}</b>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
