'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { Geometry, MapSpot, SpotStatus } from '@/lib/types';
import { Button, STATUS_COLOR, StatusPatternDefs, StatusSwatch, cn, statusFill } from './ui';
import { useI18n } from './providers';

export interface FloorMapProps {
  viewBox: [number, number, number, number];
  planSvg: string | null;
  spots: MapSpot[];
  geometryOverride: Map<string, Geometry | null>;
  selectedId: string | null;
  multiSelected: Set<string>;
  highlight: Set<string> | null;
  visibleStatuses: Set<SpotStatus>;
  editMode: boolean;
  /** smoothly zoom the camera onto this spot */
  focusId?: string | null;
  onSpotClick: (spot: MapSpot) => void;
  onCanvasClick?: (pt: { x: number; y: number }) => void;
  className?: string;
  children?: React.ReactNode;
}

function Controls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const { t } = useI18n();
  return (
    <div className="glass absolute bottom-3 end-3 z-[20] flex flex-col gap-0.5 rounded-panel p-1">
      <Button variant="ghost" size="icon" onClick={() => zoomIn(0.5, 350, 'easeOutQuint')} title={t.floors.zoomIn} aria-label={t.floors.zoomIn}>
        <Plus className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => zoomOut(0.5, 350, 'easeOutQuint')} title={t.floors.zoomOut} aria-label={t.floors.zoomOut}>
        <Minus className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => resetTransform(500, 'easeInOutQuart')} title={t.floors.reset} aria-label={t.floors.reset}>
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}

/** Spot lens camera: glides onto the selected spot. */
function FocusCamera({ focusId }: { focusId?: string | null }) {
  const { zoomToElement } = useControls();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusId === last.current) return;
    last.current = focusId;
    const el = document.getElementById(`spot-${focusId}`);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    zoomToElement(el as unknown as HTMLElement, 1.8, reduce ? 0 : 550, 'easeOutQuint');
  }, [focusId, zoomToElement]);
  return null;
}

const PlanLayer = memo(function PlanLayer({ svg }: { svg: string }) {
  return <g dangerouslySetInnerHTML={{ __html: svg }} />;
});

export function FloorMapCanvas(p: FloorMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const { t } = useI18n();
  const [vx, vy, vw, vh] = p.viewBox;

  // label size from a typical stall's short edge
  const fontSize = useMemo(() => {
    const g = p.spots.find((s) => s.geometry)?.geometry;
    if (!g || g.points.length < 3) return Math.max(vw, vh) / 120;
    const [a, b, c] = g.points;
    return Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1])) * 0.42;
  }, [p.spots, vw, vh]);

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };
  const isClick = (e: React.PointerEvent | React.MouseEvent) => {
    const d = down.current;
    return !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6;
  };

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-sheet', p.className)} style={{ background: 'var(--plan-bg)' }}>
      <TransformWrapper minScale={0.6} maxScale={40} initialScale={1} centerOnInit limitToBounds={false} wheel={{ step: 0.12 }} doubleClick={{ step: 0.8 }} pinch={{ step: 6 }}>
        <Controls />
        <FocusCamera focusId={p.editMode ? null : p.focusId} />
        {p.children}
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
          <svg
            ref={svgRef}
            viewBox={`${vx} ${vy} ${vw} ${vh}`}
            className={cn('h-full w-full select-none', p.editMode && 'cursor-crosshair')}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={t.floors.title}
            onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
            onClick={(e) => {
              if (!p.editMode || !p.onCanvasClick || !isClick(e)) return;
              if ((e.target as Element).closest('[data-spot]')) return;
              const pt = toSvgPoint(e.clientX, e.clientY);
              if (pt) p.onCanvasClick(pt);
            }}
          >
            <StatusPatternDefs />
            {p.planSvg && <PlanLayer svg={p.planSvg} />}
            <g>
              {p.spots.map((s) => {
                const geo = p.geometryOverride.has(s.id) ? p.geometryOverride.get(s.id) : s.geometry;
                if (!geo) return null;
                const dim = (p.highlight && !p.highlight.has(s.id)) || !p.visibleStatuses.has(s.status);
                const selected = p.selectedId === s.id;
                const multi = p.multiSelected.has(s.id);
                const available = s.status === 'AVAILABLE';
                const label = `${s.label} — ${t.status[s.status]}${s.tenant ? ` — ${s.tenant.nameEn ?? s.tenant.nameAr}` : ''}`;
                const activate = () => p.onSpotClick(s);
                return (
                  <g key={s.id} id={`spot-${s.id}`} data-spot={s.id} opacity={dim ? 0.18 : 1} style={{ transition: 'opacity 450ms cubic-bezier(.16,1,.3,1)' }}>
                    <polygon
                      className={cn('spot', selected && 'spot-selected')}
                      points={geo.points.map((pt) => pt.join(',')).join(' ')}
                      fill={multi ? 'var(--highlight)' : statusFill(s.status)}
                      fillOpacity={multi ? 0.85 : available ? 0.16 : s.status === 'RENTED' ? 0.6 : 1}
                      stroke={selected ? 'var(--highlight)' : multi ? 'var(--highlight-ink)' : STATUS_COLOR[s.status]}
                      strokeWidth={selected || multi ? 3 : available ? 1.6 : 0.8}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray={p.editMode && p.geometryOverride.has(s.id) ? '4 3' : undefined}
                      tabIndex={dim ? -1 : 0}
                      role="button"
                      aria-label={label}
                      aria-pressed={selected || multi || undefined}
                      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isClick(e)) activate();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          activate();
                        }
                      }}
                    >
                      <title>{label}</title>
                    </polygon>
                    <text
                      className="spot-label"
                      x={geo.cx}
                      y={geo.cy}
                      fontSize={fontSize}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={s.status === 'RENTED' && !dim ? '#f7f8f6' : 'var(--text)'}
                      stroke={s.status === 'RENTED' && !dim ? 'transparent' : 'var(--plan-bg)'}
                      strokeWidth={fontSize * 0.16}
                    >
                      {s.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

/** Seat grid for spots without a drawing position (or areas without a drawing). Same status language as the map. */
export function SeatGrid({
  spots, selectedId, multiSelected, highlight, visibleStatuses, onSpotClick, className,
}: {
  spots: MapSpot[];
  selectedId: string | null;
  multiSelected: Set<string>;
  highlight: Set<string> | null;
  visibleStatuses: Set<SpotStatus>;
  onSpotClick: (s: MapSpot) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {spots.map((s) => {
        const dim = (highlight && !highlight.has(s.id)) || !visibleStatuses.has(s.status);
        const sel = selectedId === s.id || multiSelected.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSpotClick(s)}
            aria-pressed={sel}
            aria-label={`${s.label} — ${t.status[s.status]}${s.tenant ? ` — ${s.tenant.nameAr}` : ''}`}
            className={cn(
              'font-sign relative flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-t-[8px] rounded-b-[3px] bg-surface px-1.5 text-[13px] font-bold shadow-e1',
              'transition-[transform,box-shadow,opacity] duration-[180ms] ease-out hover:-translate-y-0.5 hover:shadow-e2 active:scale-95',
              sel && 'ring-2 ring-highlight ring-offset-2 ring-offset-surface',
              dim && 'opacity-25',
            )}
          >
            <StatusSwatch status={s.status} size={12} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
