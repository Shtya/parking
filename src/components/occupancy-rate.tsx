'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { fmtNumber } from '@/lib/format';
import { D, EASE_OUT } from '@/lib/motion';
import { useI18n } from './providers';
import { cn } from './ui';

const SIZE = {
  hero: { box: 'size-[4.5rem] sm:size-[5.5rem]', text: 'stencil text-stencil', gap: 'gap-4 sm:gap-5', stroke: 2.6 },
  slab: { box: 'size-[22px]', text: 'text-[13px] font-bold', gap: 'gap-1.5', stroke: 3 },
  chip: { box: 'size-7', text: 'text-[13px] font-bold', gap: 'gap-1.5', stroke: 2.8 },
} as const;

/** Where the arc ends, in degrees clockwise from the top. A full 100 lands on 360, not 0. */
function tipDeg(value: number) {
  const v = Math.max(0, value);
  if (v === 0) return 0;
  const wrapped = v % 100;
  return ((wrapped === 0 ? 100 : wrapped) / 100) * 360;
}

function paint(main: SVGCircleElement | null, over: SVGCircleElement | null, value: number) {
  const filled = Math.min(100, Math.max(0, value));
  const extra = Math.min(100, Math.max(0, value - 100));
  if (main) main.style.strokeDasharray = `${filled} ${100 - filled}`;
  if (over) over.style.strokeDasharray = `${extra} ${100 - extra}`;
}

/**
 * Occupancy percentage as a gauge: the arc fills to the real rate, a needle rests on the tip,
 * and a fine pointer can pull the needle around the ring. Past 100% a second lap is danger.
 */
export function OccupancyRate({ value, size = 'hero', digits, label, className }: { value: number; size?: keyof typeof SIZE; digits?: number; label: string; className?: string }) {
  const { locale } = useI18n();
  const reduce = useReducedMotion();
  const places = digits ?? (size === 'slab' ? 0 : 1);
  const s = SIZE[size];
  const over = value > 100;
  const rootRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const mainRef = useRef<SVGCircleElement>(null);
  const overRef = useRef<SVGCircleElement>(null);
  const inView = useInView(rootRef, { once: true, margin: '0px 0px -8% 0px' });
  const fine = useRef(false);

  const format = (n: number) => fmtNumber(n, locale, places);

  useEffect(() => {
    fine.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const num = numRef.current;
    if (!root || !num || !inView) return;
    const apply = (v: number) => {
      num.textContent = format(v);
      paint(mainRef.current, overRef.current, v);
      if (root.dataset.hot !== 'true') root.style.setProperty('--aim', `${tipDeg(v)}deg`);
    };
    if (reduce) {
      apply(value);
      return;
    }
    const controls = animate(0, value, { duration: D.cine, ease: EASE_OUT, onUpdate: apply });
    return () => controls.stop();
    // format closes over locale + places; both are the inputs that change the glyphs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, locale, places]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (reduce || !fine.current) return;
    const svg = svgRef.current;
    const root = rootRef.current;
    if (!svg || !root) return;
    const b = svg.getBoundingClientRect();
    const deg = (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI;
    root.dataset.hot = 'true';
    root.style.setProperty('--aim', `${(deg + 450) % 360}deg`);
  };
  const onPointerLeave = () => {
    const root = rootRef.current;
    if (!root) return;
    delete root.dataset.hot;
    root.style.setProperty('--aim', `${tipDeg(value)}deg`);
  };

  return (
    <span
      ref={rootRef}
      className={cn('group/occ inline-flex items-center', s.gap, over ? 'text-danger' : 'text-fg', className)}
      style={{ ['--aim' as string]: `${tipDeg(value)}deg` }}
      role="img"
      aria-label={`${label}: ${format(value)}%`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <svg ref={svgRef} viewBox="0 0 40 40" className={cn('shrink-0 overflow-visible', s.box)} aria-hidden>
        <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border-strong)" strokeWidth={s.stroke} />
        <circle ref={mainRef} cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth={s.stroke} strokeLinecap="round" pathLength={100} strokeDasharray="0 100" transform="rotate(-90 20 20)" />
        <circle ref={overRef} cx="20" cy="20" r="16" fill="none" stroke="var(--danger)" strokeWidth={s.stroke} strokeLinecap="round" pathLength={100} strokeDasharray="0 100" transform="rotate(-90 20 20)" className={over ? 'occ-over' : undefined} />
        <g className="occ-needle" style={{ transform: 'rotate(var(--aim))' }}>
          <circle cx="20" cy="4.2" r="1.7" fill="currentColor" />
        </g>
      </svg>
      <span className={cn('leading-none', size === 'hero' ? s.text : cn('font-sign', s.text))} aria-hidden>
        <span ref={numRef}>{format(reduce ? value : 0)}</span>%
      </span>
    </span>
  );
}
