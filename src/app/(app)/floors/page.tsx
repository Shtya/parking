'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpLeft, ArrowUpRight, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtNumber, floorName } from '@/lib/format';
import type { Floor } from '@/lib/types';
import { ErrorState, LevelSign, PageHeader, Skeleton, StatusSwatch, cn } from '@/components/ui';
import { useI18n } from '@/components/providers';
import { occupancyOf } from '@/components/level-stack';
import { OccupancyRate } from '@/components/occupancy-rate';

/** Building order: upper levels first, basements last, then the outdoor areas. */
const byBuilding = (a: Floor, b: Floor) => (a.kind === b.kind ? b.level - a.level : a.kind === 'INDOOR' ? -1 : 1);

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <p className="truncate text-[11px] font-semibold text-muted">{label}</p>
      <p className={cn('font-sign mt-1 text-[18px] leading-none font-bold', tone)}>{value}</p>
    </div>
  );
}

function FloorCard({ f }: { f: Floor }) {
  const { t, locale, dir } = useI18n();
  const s = f.stats;
  const { cap, occ, rate } = occupancyOf(f);
  const Arrow = dir === 'rtl' ? ArrowUpLeft : ArrowUpRight;
  const followUp = (s?.EXPIRING ?? 0) + (s?.EXPIRED ?? 0);
  const over = rate > 100;
  return (
    <Link
      href={`/floors/${f.code}`}
      data-level={f.code}
      className="group flex flex-col overflow-hidden rounded-panel bg-surface shadow-e1 ring-1 ring-border/60 transition-[box-shadow,transform] duration-[180ms] ease-out hover:-translate-y-0.5 hover:shadow-e2 focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* the drawing, seen from outside */}
      <div className="relative h-32 overflow-hidden" style={{ background: 'var(--plan-bg)' }}>
        {f.svgPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.svgPath}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain p-4 contrast-[1.6] grayscale transition-transform duration-[450ms] ease-out group-hover:scale-[1.04] dark:opacity-70 dark:invert"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted/60">
            <Layers className="size-7" aria-hidden />
          </div>
        )}
        <LevelSign code={f.code} size="sm" className="absolute top-3 start-3" />
        <span className="absolute top-3 end-3 grid size-7 place-items-center rounded-full bg-surface/90 text-muted opacity-0 shadow-e1 transition-opacity duration-[180ms] group-hover:opacity-100">
          <Arrow className="size-3.5" aria-hidden />
        </span>
      </div>

      <div className="flex flex-1 flex-col border-t border-border/70 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[14px] font-extrabold">{floorName(f, locale)}</p>
          <p className={cn('font-sign shrink-0 text-[18px] leading-none font-bold', over ? 'text-danger' : 'text-fg')}>{fmtNumber(rate, locale, 1)}%</p>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <span className={cn('block h-full rounded-full transition-[width] duration-[450ms] ease-out', over ? 'bg-danger' : 'bg-accent')} style={{ width: `${Math.min(100, rate)}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-muted">
          <span className="font-sign font-semibold text-fg">{fmtNumber(occ, locale)}</span> {t.dashboard.allocatedOf} <span className="font-sign">{fmtNumber(cap, locale)}</span> {t.floors.inUse}
        </p>

        <div className="mt-auto grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-3">
          <Metric label={t.status.AVAILABLE} value={fmtNumber(s?.AVAILABLE ?? 0, locale)} tone={s?.AVAILABLE ? 'text-success' : 'text-muted'} />
          <Metric label={t.status.RENTED} value={fmtNumber(s?.RENTED ?? 0, locale)} />
          <Metric label={t.floors.followUp} value={fmtNumber(followUp, locale)} tone={followUp ? 'text-warning' : 'text-muted'} />
        </div>
        {!!f.allocatedUnnumbered && (
          <p className="mt-3 rounded-[6px] bg-sunken/70 px-2.5 py-1.5 text-center text-[11px] text-muted">
            + <span className="font-sign font-semibold text-fg">{fmtNumber(f.allocatedUnnumbered, locale)}</span> {t.floors.unnumberedNote}
          </p>
        )}
      </div>
    </Link>
  );
}

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
  const floors = data ? [...data].sort(byBuilding) : [];

  return (
    <>
      <PageHeader title={t.floors.title} subtitle={t.floors.overviewSubtitle} />

      {/* whole site — one compact strip */}
      {totals ? (
        <section aria-label={t.floors.wholeBuilding} className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-panel bg-surface px-4 py-3 shadow-e1">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-bold text-muted">{t.floors.wholeBuilding}</span>
            <OccupancyRate value={totals.cap ? (totals.occ / totals.cap) * 100 : 0} size="md" label={t.dashboard.occupancy} />
          </div>
          <p className="text-[13px] text-muted">
            <b className="font-sign text-fg">{fmtNumber(totals.occ, locale)}</b> {t.dashboard.allocatedOf} <b className="font-sign text-fg">{fmtNumber(totals.cap, locale)}</b> {t.dashboard.spacesAllocated}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] md:ms-auto">
            {(['AVAILABLE', 'RENTED', 'EXPIRING', 'EXPIRED', 'INACTIVE'] as const).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <StatusSwatch status={s} size={12} />
                <span className="text-muted">{t.status[s]}</span>
                <b className="font-sign">{fmtNumber(data?.reduce((a, f) => a + (f.stats?.[s] ?? 0), 0), locale)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Skeleton className="mb-5 h-16 rounded-panel" />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {isLoading || !data ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-panel" />) : floors.map((f) => <FloorCard key={f.code} f={f} />)}
      </div>
    </>
  );
}
