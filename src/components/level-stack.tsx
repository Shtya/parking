'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import type { Floor } from '@/lib/types';
import { fmtNumber, floorName } from '@/lib/format';
import { SPRING } from '@/lib/motion';
import { LevelSign, STATUS_COLOR, cn } from './ui';
import { OccupancyRate } from './occupancy-rate';
import { useI18n } from './providers';

export function occupancyOf(f: Floor) {
  const s = f.stats;
  const cap = f.officialCapacity ?? s?.total ?? 0;
  const occ = (s?.occupied ?? 0) + (f.allocatedUnnumbered ?? 0);
  return { cap, occ, rate: cap ? (occ / cap) * 100 : 0 };
}

function splitBuilding(floors: Floor[]) {
  const indoor = floors.filter((f) => f.kind === 'INDOOR').sort((a, b) => b.level - a.level);
  const outdoor = floors.filter((f) => f.kind === 'OUTDOOR').sort((a, b) => a.level - b.level);
  return { above: indoor.filter((f) => f.level >= 0), below: indoor.filter((f) => f.level < 0), outdoor };
}

function Slab({ f, current, large }: { f: Floor; current?: string; large?: boolean }) {
  const { t, locale } = useI18n();
  const { cap, occ, rate } = occupancyOf(f);
  const active = f.code === current;
  const over = rate > 100;
  return (
    <Link
      href={`/floors/${f.code}`}
      data-level={f.code}
      aria-current={active ? 'page' : undefined}
      aria-label={`${floorName(f, locale)} — ${fmtNumber(rate, locale, 1)}%`}
      className={cn(
        'group relative block rounded-[6px] transition-[background-color,transform] duration-[180ms] ease-out active:scale-[0.985]',
        large ? 'px-4 py-4' : 'px-2.5 py-2',
        !active && 'hover:bg-sunken/70',
      )}
    >
      {active && (
        <motion.span
          layoutId="level-active"
          transition={SPRING}
          className="absolute inset-0 rounded-[6px] bg-surface-raised shadow-e1 ring-1 ring-[var(--lv)]/40"
          aria-hidden
        />
      )}
      <span className="relative flex items-center gap-3">
        <LevelSign code={f.code} size={large ? 'lg' : 'sm'} />
        <span className="min-w-0 flex-1">
          <span className={cn('flex items-center justify-between gap-2', large ? 'text-[15px]' : 'text-[13px]')}>
            <span className={cn('truncate font-bold', !active && 'text-fg/85')}>{floorName(f, locale)}</span>
            <OccupancyRate value={rate} size="slab" label={floorName(f, locale)} />
          </span>
          {/* slab fill = occupancy */}
          <span className={cn('relative mt-1.5 block overflow-hidden rounded-[2px] bg-sunken', large ? 'h-2.5' : 'h-1.5')}>
            <span className="absolute inset-y-0 start-0 bg-[var(--lv)] transition-[width] duration-[450ms] ease-out" style={{ width: `${Math.min(100, rate)}%` }} />
            {over && <span className="absolute inset-y-0 end-0 w-1.5 bg-danger" />}
          </span>
          {large && (
            <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
              <span>
                <b className="font-sign text-fg">{fmtNumber(occ, locale)}</b> / {fmtNumber(cap, locale)}
              </span>
              {(['AVAILABLE', 'EXPIRING', 'EXPIRED'] as const).map((k) =>
                f.stats?.[k] ? (
                  <span key={k} className="flex items-center gap-1">
                    <span className="size-2 rounded-[2px]" style={{ background: STATUS_COLOR[k] }} />
                    {t.status[k]} <b className="font-sign text-fg">{f.stats[k]}</b>
                  </span>
                ) : null,
              )}
              {!!f.allocatedUnnumbered && (
                <span>
                  {t.dashboard.unnumbered} <b className="font-sign text-fg">{f.allocatedUnnumbered}</b>
                </span>
              )}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/** The building in section: levels above ground, the street line, basements, then outdoor areas. */
export function LevelStack({ floors, current, large, className }: { floors: Floor[]; current?: string; large?: boolean; className?: string }) {
  const { t } = useI18n();
  const { above, below, outdoor } = splitBuilding(floors);
  return (
    <nav aria-label={t.floors.levels} className={cn('flex flex-col', large ? 'gap-1.5' : 'gap-0.5', className)}>
      {above.map((f) => (
        <Slab key={f.code} f={f} current={current} large={large} />
      ))}
      <div className="my-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold text-muted" aria-hidden>
        <span className="h-[3px] flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_6px,transparent_6px_10px)]" />
        {t.floors.street}
        <span className="h-[3px] flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_6px,transparent_6px_10px)]" />
      </div>
      {below.map((f) => (
        <Slab key={f.code} f={f} current={current} large={large} />
      ))}
      {outdoor.length > 0 && (
        <>
          <p className={cn('px-1 font-semibold text-muted', large ? 'mt-6 mb-1 text-[13px]' : 'mt-4 mb-0.5 text-[11px]')}>{t.floors.outdoor}</p>
          {outdoor.map((f) => (
            <Slab key={f.code} f={f} current={current} large={large} />
          ))}
        </>
      )}
    </nav>
  );
}

/** Compact horizontal level switcher for small screens. */
export function LevelChips({ floors, current }: { floors: Floor[]; current?: string }) {
  const { locale } = useI18n();
  const ordered = [...floors].sort((a, b) => (a.kind === b.kind ? b.level - a.level : a.kind === 'INDOOR' ? -1 : 1));
  return (
    <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {ordered.map((f) => {
        const active = f.code === current;
        return (
          <Link
            key={f.code}
            href={`/floors/${f.code}`}
            data-level={f.code}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'font-sign flex h-9 shrink-0 items-center gap-2 rounded-[6px] px-3 text-[14px] font-bold transition-colors duration-[180ms]',
              active ? 'bg-[var(--lv)] text-white shadow-e1' : 'bg-surface text-fg ring-1 ring-border',
            )}
            aria-label={floorName(f, locale)}
          >
            {f.code}
            <span className={cn('text-[12px] font-semibold', active ? 'text-white/85' : 'text-muted')}>{fmtNumber(occupancyOf(f).rate, locale, 0)}%</span>
          </Link>
        );
      })}
    </nav>
  );
}
