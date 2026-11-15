'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowUpLeft, ArrowUpRight, CalendarClock, ClipboardCheck, Layers, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtMonth, fmtNumber, tenantName } from '@/lib/format';
import { D, EASE_OUT } from '@/lib/motion';
import type { Contract, Floor, Paged } from '@/lib/types';
import { Badge, ErrorState, Skeleton, cn } from '@/components/ui';
import { useI18n } from '@/components/providers';
import { Counter } from '@/components/motion-bits';
import { LevelStack } from '@/components/level-stack';
import { OccupancyRate } from '@/components/occupancy-rate';

interface Dashboard {
  expiringThresholdDays: number;
  totals: {
    capacity: number; occupied: number; occupancyRate: number; vacant: number; tenants: number; activeContracts: number; expiringContracts: number; expiredContracts: number;
    needsReview: number; belowMinimum: number; annualRevenue: number; monthlyRevenue: number; revenueAtRisk: number;
  };
  byFloor: { code: string; nameAr: string; nameEn: string; overbooked: number }[];
  timeline: { month: string; contracts: number; amount: number }[];
}

/** Twelve months laid out as a runway; each contract is a painted tick on the month it ends. */
function ExpiryRunway({ dash, contracts }: { dash: Dashboard; contracts: Contract[] }) {
  const { t, locale } = useI18n();
  const months = dash.timeline;
  const byMonth = useMemo(() => {
    const m = new Map<string, Contract[]>();
    contracts.forEach((c) => {
      const k = c.endDate.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), c]);
    });
    return m;
  }, [contracts]);
  const max = Math.max(1, ...months.map((m) => m.contracts));
  const firstBusy = months.find((m) => m.contracts)?.month ?? months[0]?.month;
  const [sel, setSel] = useState<string | undefined>(undefined);
  const active = sel ?? firstBusy;
  const list = (active && byMonth.get(active)) || [];
  const peak = months.reduce((a, b) => (b.contracts > a.contracts ? b : a), months[0]);
  const clustered = peak && dash.totals.activeContracts > 4 && peak.contracts / dash.totals.activeContracts >= 0.5;

  return (
    <section aria-labelledby="runway-h" className="rounded-sheet bg-surface shadow-e1">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="runway-h" className="text-lg font-extrabold">
            {t.dashboard.runwayTitle}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{t.dashboard.runwayHint}</p>
        </div>
        {clustered && (
          <p className="flex items-center gap-2 rounded-[6px] bg-warning-soft px-3 py-1.5 text-[13px] font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            <span>
              <b className="font-sign">{fmtNumber(peak.contracts, locale)}</b> {t.dashboard.ofContracts} <b className="font-sign">{fmtNumber(dash.totals.activeContracts, locale)}</b> {t.dashboard.endIn}{' '}
              {fmtMonth(peak.month, locale)}
            </span>
          </p>
        )}
      </div>

      {/* the runway */}
      <div className="no-scrollbar overflow-x-auto px-3 pt-6 sm:px-4">
        <div className="relative grid min-w-[680px] grid-cols-[repeat(13,minmax(0,1fr))] items-end gap-1.5" role="listbox" aria-label={t.dashboard.runwayTitle}>
          <div className="pointer-events-none absolute inset-x-0 bottom-[30px] h-[3px] rounded-full bg-[repeating-linear-gradient(90deg,var(--highlight)_0_14px,transparent_14px_24px)] opacity-70" aria-hidden />
          {months.map((m, i) => {
            const on = m.month === active;
            const h = m.contracts ? Math.max(10, (m.contracts / max) * 168) : 0;
            const urgent = i === 0 || (i === 1 && dash.expiringThresholdDays > 30);
            return (
              <button
                key={m.month}
                type="button"
                role="option"
                aria-selected={on}
                aria-label={`${fmtMonth(m.month, locale)}: ${m.contracts} ${t.dashboard.contractsCount}`}
                onClick={() => setSel(m.month)}
                className={cn('group flex h-[220px] flex-col items-center justify-end gap-2 rounded-[6px] pt-2 transition-colors duration-[180ms]', on ? 'bg-primary-soft' : 'hover:bg-sunken/60')}
              >
                {m.contracts > 0 && <span className={cn('font-sign text-[13px] font-bold', on ? 'text-accent' : 'text-muted')}>{m.contracts}</span>}
                <motion.span
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: D.cine, ease: EASE_OUT, delay: i * D.stagger }}
                  className="block w-[min(38px,70%)] origin-bottom rounded-t-[3px]"
                  style={{
                    height: h,
                    background: `repeating-linear-gradient(to top, ${urgent ? 'var(--st-expiring)' : on ? 'var(--accent)' : 'var(--border-strong)'} 0 4px, transparent 4px 6px)`,
                  }}
                />
                <span className={cn('font-sign h-[22px] text-[12px] font-semibold whitespace-nowrap', on ? 'text-accent' : 'text-muted')}>{fmtMonth(m.month, locale)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* selected month */}
      <div className="border-t border-border/70 px-5 py-4 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: D.micro, ease: EASE_OUT }}>
            {!list.length ? (
              <p className="py-2 text-sm text-muted">{t.dashboard.noneThisMonth}</p>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-muted">
                  {fmtMonth(active!, locale)}: <b className="font-sign text-fg">{list.length}</b> {t.dashboard.contractsCount},{' '}
                  <b className="font-sign text-fg">{fmtMoney(list.reduce((a, c) => a + Number(c.annualAmount), 0), locale)}</b>
                </p>
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                  {list.slice(0, 12).map((c) => (
                    <li key={c.id}>
                      <Link href={`/contracts/${c.id}`} className="flex items-baseline justify-between gap-3 rounded-[6px] px-2 py-1.5 text-sm hover:bg-sunken/60">
                        <span className="truncate font-semibold">{tenantName(c.tenant, locale)}</span>
                        <span className="font-sign shrink-0 text-[12px] text-muted">{fmtDate(c.endDate, locale)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {list.length > 12 && (
                  <Link href="/contracts?status=ACTIVE" className="mt-2 inline-block px-2 text-[13px] font-bold text-accent hover:underline">
                    {t.dashboard.andMore.replace('{n}', String(list.length - 12))}
                  </Link>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { t, locale, dir } = useI18n();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 120_000 });
  const floors = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  const active = useQuery({ queryKey: ['contracts', 'runway'], queryFn: () => api<Paged<Contract>>('/contracts', { query: { status: 'ACTIVE', pageSize: 500 } }) });
  const money = useCallback((n: number) => fmtMoney(Math.round(n), locale), [locale]);

  if (dash.error) return <ErrorState error={dash.error} onRetry={dash.refetch} />;
  const d = dash.data;
  const Arrow = dir === 'rtl' ? ArrowUpLeft : ArrowUpRight;

  const attention = d
    ? [
        d.totals.expiringContracts > 0 && { icon: CalendarClock, tone: 'text-warning', n: d.totals.expiringContracts, text: `${t.dashboard.expiringRow} ${d.expiringThresholdDays} ${t.common.days}`, href: `/contracts?expiring=${d.expiringThresholdDays}` },
        d.totals.expiredContracts > 0 && { icon: CalendarClock, tone: 'text-danger', n: d.totals.expiredContracts, text: t.dashboard.expiredRow, href: '/contracts?status=EXPIRED' },
        d.totals.needsReview > 0 && { icon: ClipboardCheck, tone: 'text-accent', n: d.totals.needsReview, text: t.dashboard.reviewRow, href: '/contracts?needsReview=true' },
        d.totals.belowMinimum > 0 && { icon: UserMinus, tone: 'text-warning', n: d.totals.belowMinimum, text: t.dashboard.belowRow, href: '/tenants' },
        ...d.byFloor
          .filter((f) => f.overbooked > 0)
          .map((f) => ({ icon: Layers, tone: 'text-danger', n: f.overbooked, text: `${t.dashboard.overRow} (${locale === 'ar' ? f.nameAr : f.nameEn})`, href: `/floors/${f.code}` })),
      ].filter(Boolean) as { icon: typeof Layers; tone: string; n: number; text: string; href: string }[]
    : [];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* headline — the one oversized moment */}
      <header className="pt-2">
        <p className="text-[14px] font-semibold text-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        {d ? (
          <h1 className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[clamp(1.5rem,1.2rem+1.2vw,2.25rem)] font-extrabold tracking-tight">{t.dashboard.headline}</span>
            <OccupancyRate value={d.totals.occupancyRate} label={t.dashboard.occupancy} />
          </h1>
        ) : (
          <Skeleton className="mt-3 h-24 w-2/3" />
        )}
        {d && (
          <p className="mt-3 max-w-[65ch] text-[15px] text-muted">
            <b className="font-sign text-fg">{fmtNumber(d.totals.occupied, locale)}</b> {t.dashboard.allocatedOf} <b className="font-sign text-fg">{fmtNumber(d.totals.capacity, locale)}</b> {t.dashboard.spacesAllocated},{' '}
            <b className="font-sign text-success">{fmtNumber(d.totals.vacant, locale)}</b> {t.dashboard.free}. {fmtNumber(d.totals.tenants, locale)} {t.dashboard.tenantsIn} {fmtNumber(d.totals.activeContracts, locale)} {t.dashboard.activeContractsLower}.
          </p>
        )}
      </header>

      {d && active.data ? <ExpiryRunway dash={d} contracts={active.data.items} /> : <Skeleton className="h-[360px] rounded-sheet" />}

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-8">
        <section aria-labelledby="levels-h" className="rounded-sheet bg-surface p-4 shadow-e1">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 id="levels-h" className="text-[15px] font-extrabold">
              {t.dashboard.levelsTitle}
            </h2>
            <Link href="/floors" className="text-[13px] font-bold text-accent hover:underline">
              {t.common.view}
            </Link>
          </div>
          {floors.data ? <LevelStack floors={floors.data} /> : <Skeleton className="h-80" />}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="att-h">
            <h2 id="att-h" className="mb-3 text-[15px] font-extrabold">
              {t.dashboard.attention}
            </h2>
            {!d ? (
              <Skeleton className="h-48" />
            ) : !attention.length ? (
              <p className="rounded-panel bg-success-soft px-4 py-3 text-sm font-semibold text-success">{t.dashboard.allClear}</p>
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-sheet bg-surface shadow-e1">
                {attention.map((a, i) => (
                  <motion.li key={a.href + i} initial={{ opacity: 0, x: dir === 'rtl' ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: D.std, ease: EASE_OUT, delay: 0.2 + i * D.stagger }}>
                    <Link href={a.href} className="lit group flex items-center gap-4 px-5 py-4 transition-colors duration-[180ms] hover:bg-sunken/40">
                      <a.icon className={cn('size-5 shrink-0', a.tone)} aria-hidden />
                      <span className="font-sign w-14 shrink-0 text-[1.6rem] leading-none font-bold">{fmtNumber(a.n, locale)}</span>
                      <span className="flex-1 text-[14px] font-semibold">{a.text}</span>
                      <Arrow className="size-4 text-muted transition-transform duration-[180ms] group-hover:-translate-y-0.5 group-hover:text-accent" aria-hidden />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>

          {d && (
            <section aria-labelledby="rev-h" className="rounded-sheet bg-accent px-6 py-5 text-primary-fg shadow-e2">
              <h2 id="rev-h" className="text-[14px] font-semibold opacity-85">
                {t.dashboard.revenueLine}
              </h2>
              <p className="font-sign mt-1 text-[clamp(2rem,1.6rem+1.6vw,3rem)] leading-none font-extrabold">
                <Counter value={d.totals.annualRevenue} format={money} />
              </p>
              <p className="mt-3 text-[14px] opacity-90">
                <b className="font-sign">{fmtMoney(d.totals.monthlyRevenue, locale)}</b> {t.dashboard.perMonth}.{' '}
                {d.totals.revenueAtRisk > 0 ? (
                  <>
                    <b className="font-sign">{fmtMoney(d.totals.revenueAtRisk, locale)}</b> {t.dashboard.atRiskLine}.
                  </>
                ) : (
                  t.dashboard.noRisk
                )}
              </p>
              {d.totals.needsReview > 0 && (
                <Badge className="mt-3 bg-white/15 text-primary-fg">
                  <ClipboardCheck className="size-3.5" />
                  {t.dashboard.revenueEstimate}
                </Badge>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
