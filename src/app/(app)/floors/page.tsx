'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtNumber, floorName } from '@/lib/format';
import type { Floor, SpotStatus } from '@/lib/types';
import { Card, ErrorState, PageHeader, Progress, Skeleton, STATUS_COLOR } from '@/components/ui';
import { useI18n } from '@/components/providers';

const ORDER: SpotStatus[] = ['RENTED', 'EXPIRING', 'EXPIRED', 'AVAILABLE', 'INACTIVE'];

export default function FloorsPage() {
  const { t, locale } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <>
      <PageHeader title={t.floors.title} subtitle={t.floors.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52" />)}
        {data?.map((f) => {
          const s = f.stats!;
          const cap = f.officialCapacity ?? s.total;
          const occ = s.occupied + (f.allocatedUnnumbered ?? 0);
          const rate = cap ? (occ / cap) * 100 : 0;
          return (
            <Link key={f.code} href={`/floors/${f.code}`} className="group">
              <Card className="h-full overflow-hidden transition group-hover:border-primary/50 group-hover:shadow-md">
                <div className="relative h-28 overflow-hidden border-b border-border" style={{ background: 'var(--plan-bg)' }}>
                  {f.svgPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.svgPath} alt="" className="h-full w-full object-contain p-2 opacity-80 dark:invert dark:hue-rotate-180" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted">
                      <Layers className="size-8" />
                    </div>
                  )}
                  <span className="absolute top-2 start-2 rounded-lg bg-surface/90 px-2 py-0.5 text-xs font-bold shadow-sm">{f.code}</span>
                  <ArrowUpRight className="absolute top-2 end-2 size-4 text-muted opacity-0 transition group-hover:opacity-100 rtl:-scale-x-100" />
                </div>
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{floorName(f, locale)}</p>
                    <p className="text-sm font-semibold tabular-nums">{fmtNumber(rate, locale, 1)}%</p>
                  </div>
                  <p className="mb-2 text-xs text-muted">
                    {fmtNumber(occ, locale)} / {fmtNumber(cap, locale)} · {fmtNumber(s.total, locale)} {t.common.spots}
                  </p>
                  <Progress value={rate} color={rate > 100 ? 'var(--st-expired)' : 'var(--primary)'} />
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full">
                    {ORDER.map((k) => (s[k] ? <div key={k} style={{ flex: s[k], background: STATUS_COLOR[k] }} title={`${t.status[k]}: ${s[k]}`} /> : null))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    {ORDER.filter((k) => s[k]).map((k) => (
                      <span key={k} className="flex items-center gap-1">
                        <span className="size-2 rounded-sm" style={{ background: STATUS_COLOR[k] }} />
                        {t.status[k]} {s[k]}
                      </span>
                    ))}
                    {!!f.allocatedUnnumbered && (
                      <span>
                        · {t.dashboard.unnumbered} {f.allocatedUnnumbered}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
