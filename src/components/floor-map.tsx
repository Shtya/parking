'use client';

import { memo, useMemo, useRef } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { Geometry, MapSpot, SpotStatus } from '@/lib/types';
import { Button, STATUS_COLOR, cn } from './ui';
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
  onSpotClick: (spot: MapSpot) => void;
  onCanvasClick?: (pt: { x: number; y: number }) => void;
}

function Controls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const { t } = useI18n();
  return (
    <div className="absolute bottom-3 end-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-surface/95 p-1 shadow-lg backdrop-blur">
      <Button variant="ghost" size="icon" onClick={() => zoomIn(0.4)} title={t.floors.zoomIn} aria-label={t.floors.zoomIn}>
        <Plus className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => zoomOut(0.4)} title={t.floors.zoomOut} aria-label={t.floors.zoomOut}>
        <Minus className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => resetTransform()} title={t.floors.reset} aria-label={t.floors.reset}>
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}

const PlanLayer = memo(function PlanLayer({ svg }: { svg: string }) {
  return <g dangerouslySetInnerHTML={{ __html: svg }} />;
});

export function FloorMapCanvas(p: FloorMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const [vx, vy, vw, vh] = p.viewBox;

  // label size from a typical stall's short edge
  const fontSize = useMemo(() => {
    const g = p.spots.find((s) => s.geometry)?.geometry;
    if (!g || g.points.length < 3) return Math.max(vw, vh) / 120;
    const [a, b, c] = g.points;
    const e1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const e2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    return Math.min(e1, e2) * 0.4;
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
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border" style={{ background: 'var(--plan-bg)' }}>
      <TransformWrapper minScale={0.6} maxScale={40} initialScale={1} centerOnInit limitToBounds={false} wheel={{ step: 0.12 }} doubleClick={{ step: 0.8 }} pinch={{ step: 6 }}>
        <Controls />
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
          <svg
            ref={svgRef}
            viewBox={`${vx} ${vy} ${vw} ${vh}`}
            className="h-full w-full select-none"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
            onClick={(e) => {
              if (!p.editMode || !p.onCanvasClick || !isClick(e)) return;
              if ((e.target as Element).closest('[data-spot]')) return;
              const pt = toSvgPoint(e.clientX, e.clientY);
              if (pt) p.onCanvasClick(pt);
            }}
          >
            {p.planSvg && <PlanLayer svg={p.planSvg} />}
            <g>
              {p.spots.map((s) => {
                const geo = p.geometryOverride.has(s.id) ? p.geometryOverride.get(s.id) : s.geometry;
                if (!geo) return null;
                const visible = p.visibleStatuses.has(s.status);
                const dim = (p.highlight && !p.highlight.has(s.id)) || !visible;
                const selected = p.selectedId === s.id;
                const multi = p.multiSelected.has(s.id);
                const color = STATUS_COLOR[s.status];
                return (
                  <g key={s.id} data-spot={s.id}>
                    <polygon
                      className="spot"
                      points={geo.points.map((pt) => pt.join(',')).join(' ')}
                      fill={color}
                      fillOpacity={dim ? 0.08 : selected || multi ? 0.85 : 0.5}
                      stroke={selected ? 'var(--text)' : multi ? 'var(--primary)' : color}
                      strokeWidth={selected || multi ? fontSize * 0.22 : fontSize * 0.06}
                      strokeDasharray={p.editMode && p.geometryOverride.has(s.id) ? `${fontSize * 0.3} ${fontSize * 0.2}` : undefined}
                      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isClick(e)) p.onSpotClick(s);
                      }}
                    >
                      <title>{`${s.label}${s.tenant ? ` · ${s.tenant.code ?? s.tenant.nameAr}` : ''}`}</title>
                    </polygon>
                    <text
                      className="spot-label"
                      x={geo.cx}
                      y={geo.cy}
                      fontSize={fontSize}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={dim ? 'var(--muted)' : 'var(--text)'}
                      stroke="var(--plan-bg)"
                      strokeWidth={fontSize * 0.18}
                      opacity={dim ? 0.4 : 1}
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

/** Cinema-style seat grid for spots that have no drawing position (or areas without a drawing). */
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
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {spots.map((s) => {
        const dim = (highlight && !highlight.has(s.id)) || !visibleStatuses.has(s.status);
        const sel = selectedId === s.id || multiSelected.has(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onSpotClick(s)}
            title={s.tenant ? `${s.label} · ${s.tenant.nameAr}` : s.label}
            className={cn(
              'relative grid h-10 min-w-10 place-items-center rounded-t-lg rounded-b-sm border px-1 text-[11px] font-semibold transition',
              sel ? 'ring-2 ring-fg ring-offset-1 ring-offset-surface' : 'hover:-translate-y-0.5',
              dim && 'opacity-25',
            )}
            style={{ background: `color-mix(in oklab, ${STATUS_COLOR[s.status]} 40%, transparent)`, borderColor: STATUS_COLOR[s.status] }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
