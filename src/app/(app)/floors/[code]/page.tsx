'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, CheckSquare, ExternalLink, History, Info, MousePointerClick, PenSquare, RotateCw, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtNumber, floorName, tenantName } from '@/lib/format';
import type { Floor, FloorMap, Geometry, MapSpot, SpotStatus } from '@/lib/types';
import { Badge, Button, Card, ContractStatusBadge, EmptyState, ErrorState, Input, Skeleton, StatusBadge, STATUS_COLOR, cn } from '@/components/ui';
import { useCan, useI18n } from '@/components/providers';
import { FloorMapCanvas, SeatGrid } from '@/components/floor-map';

const ALL: SpotStatus[] = ['AVAILABLE', 'RENTED', 'EXPIRING', 'EXPIRED', 'INACTIVE'];

function FloorTabs({ floors, current }: { floors: Floor[]; current: string }) {
  const { locale } = useI18n();
  return (
    <div className="no-print -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
      {floors.map((f) => (
        <Link
          key={f.code}
          href={`/floors/${f.code}`}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
            f.code === current ? 'border-primary bg-primary text-primary-fg shadow-sm' : 'border-border bg-surface hover:border-primary/40',
          )}
        >
          <span className="font-semibold">{f.code}</span>
          <span className={cn('hidden sm:inline', f.code === current ? 'opacity-90' : 'text-muted')}>{floorName(f, locale)}</span>
        </Link>
      ))}
    </div>
  );
}

interface SpotDetail {
  id: string;
  label: string;
  history: {
    kind: string;
    annualPrice: string;
    contract: { id: string; number: string; status: 'ACTIVE' | 'RENEWED' | 'EXPIRED' | 'TERMINATED' | 'DRAFT'; startDate: string; endDate: string };
    tenant: { nameAr: string; nameEn: string | null };
  }[];
}

function SpotPanel({ spot, floorCode, onClose, onChanged }: { spot: MapSpot; floorCode: string; onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const can = useCan();
  const { data: detail } = useQuery({ queryKey: ['spot', spot.id], queryFn: () => api<SpotDetail>(`/spots/${spot.id}`) });
  const toggleService = async () => {
    await api(`/spots/${spot.id}`, { method: 'PATCH', body: { isActive: !spot.isActive } });
    toast.success(t.common.saved);
    onChanged();
  };
  const rows: [string, React.ReactNode][] = [
    [t.common.type, t.spotType[spot.type]],
    [
      t.floors.tenant,
      spot.tenant ? (
        <Link href={`/tenants/${spot.tenant.id}`} className="text-primary hover:underline">
          {tenantName(spot.tenant, locale)}
        </Link>
      ) : (
        <span className="text-muted">{t.floors.noTenant}</span>
      ),
    ],
    [
      t.floors.contract,
      spot.contract ? (
        <Link href={`/contracts/${spot.contract.id}`} className="font-medium text-primary hover:underline">
          {spot.contract.number}
        </Link>
      ) : (
        '—'
      ),
    ],
    [t.floors.start, fmtDate(spot.contract?.startDate, locale)],
    [t.floors.end, fmtDate(spot.contract?.endDate, locale)],
    [
      t.floors.daysLeft,
      spot.daysLeft !== undefined ? (
        <span className={cn(spot.daysLeft < 0 ? 'text-red-600' : spot.daysLeft <= 60 ? 'text-amber-600' : '')}>
          {fmtNumber(spot.daysLeft, locale)} {t.common.days}
        </span>
      ) : (
        '—'
      ),
    ],
    [t.floors.kind, spot.kind ? t.kind[spot.kind] : '—'],
  ];
  return (
    <Card className="flex max-h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <p className="text-xs text-muted">
            {t.floors.spot} · {floorCode}
          </p>
          <p className="text-3xl font-semibold tracking-tight">{spot.label}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusBadge status={spot.status} />
            {spot.contract?.needsReview && <Badge tone="amber">{t.floors.reviewBadge}</Badge>}
            {!spot.geometry && <Badge tone="gray">{t.floors.unplaced}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t.common.close}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <dl className="space-y-2.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="text-end">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {spot.contract && (
            <Link href={`/contracts/${spot.contract.id}`}>
              <Button size="sm" variant="outline">
                <ExternalLink className="size-3.5" />
                {t.floors.viewContract}
              </Button>
            </Link>
          )}
          {spot.contract && (spot.status === 'EXPIRING' || spot.status === 'EXPIRED') && (
            <Link href={`/contracts/${spot.contract.id}?renew=1`}>
              <Button size="sm">
                <CalendarClock className="size-3.5" />
                {t.floors.renew}
              </Button>
            </Link>
          )}
          {spot.status === 'AVAILABLE' && (
            <Link href={`/contracts/new?spots=${spot.id}`}>
              <Button size="sm">{t.floors.newContract}</Button>
            </Link>
          )}
          {can('ADMIN', 'OWNER', 'STAFF') && (
            <Button size="sm" variant="ghost" onClick={toggleService}>
              {spot.isActive ? t.floors.setOutOfService : t.floors.setInService}
            </Button>
          )}
        </div>

        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <History className="size-3.5" />
            {t.floors.history}
          </p>
          {!detail ? (
            <Skeleton className="h-16" />
          ) : !detail.history.length ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ol className="relative space-y-3 border-s border-border ps-4">
              {detail.history.map((h) => (
                <li key={h.contract.id} className="text-sm">
                  <span className="absolute -start-1.5 mt-1.5 size-3 rounded-full border-2 border-surface bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/contracts/${h.contract.id}`} className="font-medium text-primary hover:underline">
                      {h.contract.number}
                    </Link>
                    <ContractStatusBadge status={h.contract.status} />
                  </div>
                  <p className="text-muted">{tenantName(h.tenant, locale)}</p>
                  <p className="text-xs text-muted">
                    {fmtDate(h.contract.startDate, locale)} → {fmtDate(h.contract.endDate, locale)} · {fmtMoney(h.annualPrice, locale)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function FloorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = decodeURIComponent(rawCode).toUpperCase();
  const { t, locale } = useI18n();
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();

  const floors = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  const map = useQuery({ queryKey: ['floor', code], queryFn: () => api<FloorMap>(`/floors/${code}`) });
  const svgPath = map.data?.floor.svgPath;
  const plan = useQuery({
    queryKey: ['plan', svgPath],
    enabled: Boolean(svgPath),
    staleTime: Infinity,
    queryFn: async () => {
      const txt = await fetch(svgPath!).then((r) => r.text());
      return txt.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState<Set<SpotStatus>>(new Set(ALL));
  const [selectMode, setSelectMode] = useState(false);
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Map<string, Geometry | null>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedId(null);
    setMulti(new Set());
    setEdits(new Map());
    setEditMode(false);
    setSelectMode(false);
  }, [code]);

  const spots = useMemo(() => map.data?.spots ?? [], [map.data]);
  const selected = spots.find((s) => s.id === selectedId) ?? null;
  const placed = spots.filter((s) => (edits.has(s.id) ? edits.get(s.id) : s.geometry));
  const unplaced = spots.filter((s) => !(edits.has(s.id) ? edits.get(s.id) : s.geometry));

  const highlight = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      spots
        .filter(
          (s) =>
            s.label.toLowerCase() === q ||
            s.tenant?.nameAr.toLowerCase().includes(q) ||
            s.tenant?.nameEn?.toLowerCase().includes(q) ||
            s.tenant?.code?.toLowerCase().includes(q) ||
            s.contract?.number.toLowerCase().includes(q),
        )
        .map((s) => s.id),
    );
  }, [query, spots]);

  const template = useMemo(() => spots.find((s) => s.geometry)?.geometry ?? null, [spots]);

  const onSpotClick = (s: MapSpot) => {
    if (selectMode) {
      if (s.status !== 'AVAILABLE') return toast.info(`${s.label}: ${t.status[s.status]}`);
      setMulti((m) => {
        const n = new Set(m);
        if (n.has(s.id)) n.delete(s.id);
        else n.add(s.id);
        return n;
      });
      return;
    }
    setSelectedId(s.id === selectedId ? null : s.id);
  };

  const moveTo = (pt: { x: number; y: number }) => {
    if (!selected) return toast.info(t.floors.editorHint);
    const current = edits.has(selected.id) ? edits.get(selected.id) : selected.geometry;
    let geo: Geometry;
    if (current) {
      const dx = pt.x - current.cx;
      const dy = pt.y - current.cy;
      geo = { cx: pt.x, cy: pt.y, points: current.points.map(([x, y]) => [x + dx, y + dy]) };
    } else if (template) {
      const dx = pt.x - template.cx;
      const dy = pt.y - template.cy;
      geo = { cx: pt.x, cy: pt.y, points: template.points.map(([x, y]) => [x + dx, y + dy]) };
    } else {
      const w = 125;
      const h = 250;
      geo = { cx: pt.x, cy: pt.y, points: [[pt.x - w, pt.y - h], [pt.x + w, pt.y - h], [pt.x + w, pt.y + h], [pt.x - w, pt.y + h]] };
    }
    setEdits((e) => new Map(e).set(selected.id, geo));
  };

  const rotate = () => {
    if (!selected) return;
    const g = edits.has(selected.id) ? edits.get(selected.id) : selected.geometry;
    if (!g) return;
    const pts = g.points.map(([x, y]) => [g.cx - (y - g.cy), g.cy + (x - g.cx)] as [number, number]);
    setEdits((e) => new Map(e).set(selected.id, { ...g, points: pts }));
  };

  const saveLayout = async () => {
    setSaving(true);
    try {
      await api('/spots/geometry/bulk', { method: 'PUT', body: { items: [...edits.entries()].map(([id, geometry]) => ({ id, geometry })) } });
      toast.success(t.common.saved);
      setEdits(new Map());
      await qc.invalidateQueries({ queryKey: ['floor', code] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['floor', code] });
    qc.invalidateQueries({ queryKey: ['spot'] });
  };

  if (map.error) return <ErrorState error={map.error} onRetry={map.refetch} />;
  const floor = map.data?.floor;
  const stats = map.data?.stats;
  const allocated = map.data?.allocations.reduce((a, x) => a + x.quantity, 0) ?? 0;

  return (
    <>
      {floors.data && <FloorTabs floors={floors.data} current={code} />}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{floor ? floorName(floor, locale) : <Skeleton className="h-8 w-48" />}</h1>
          <p className="mt-1 text-sm text-muted">{t.floors.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.floors.searchSpot} className="w-56 ps-9" />
          </div>
          {!editMode && (
            <Button
              variant={selectMode ? 'primary' : 'outline'}
              onClick={() => {
                setSelectMode((v) => !v);
                setMulti(new Set());
                setSelectedId(null);
              }}
            >
              <CheckSquare className="size-4" />
              {t.floors.selectMode}
            </Button>
          )}
          {can('ADMIN', 'OWNER', 'STAFF') && !selectMode && (
            <Button
              variant={editMode ? 'primary' : 'outline'}
              onClick={() => {
                if (editMode && edits.size && !confirm(`${edits.size} ${t.floors.unsaved}`)) return;
                setEditMode((v) => !v);
                setEdits(new Map());
              }}
            >
              <PenSquare className="size-4" />
              {editMode ? t.floors.doneEditing : t.floors.editLayout}
            </Button>
          )}
        </div>
      </div>

      {/* legend / filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {ALL.map((s) => {
          const on = visible.has(s);
          return (
            <button
              key={s}
              onClick={() =>
                setVisible((v) => {
                  const n = new Set(v);
                  if (n.has(s)) n.delete(s);
                  else n.add(s);
                  return n.size ? n : new Set(ALL);
                })
              }
              className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition', on ? 'border-border bg-surface' : 'border-dashed border-border opacity-50')}
            >
              <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLOR[s] }} />
              {t.status[s]}
              <span className="font-semibold tabular-nums">{stats ? fmtNumber(stats[s], locale) : '–'}</span>
            </button>
          );
        })}
        {stats && (
          <span className="ms-auto text-xs text-muted">
            {fmtNumber(stats.occupancyRate, locale, 1)}% · {fmtNumber(stats.total, locale)} {t.common.spots}
            {floor?.officialCapacity ? ` · ${t.dashboard.capacity} ${fmtNumber(floor.officialCapacity, locale)}` : ''}
          </span>
        )}
      </div>

      {code === 'YARD' && floor && (
        <Card className="mb-3 flex flex-wrap items-center gap-3 border-blue-500/25 bg-blue-500/5 p-3 text-sm">
          <Info className="size-4 text-blue-600" />
          <span>{t.floors.unnumberedBanner}:</span>
          <b className={cn(allocated > (floor.officialCapacity ?? 0) && 'text-red-600')}>
            {fmtNumber(allocated, locale)} {t.floors.allocated}
          </b>
          <span className="text-muted">
            / {fmtNumber(floor.officialCapacity, locale)} {t.floors.ofCapacity}
          </span>
          <details className="w-full">
            <summary className="cursor-pointer text-xs text-primary">
              {t.contracts.tenant} ({map.data?.allocations.length})
            </summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {[...(map.data?.allocations ?? [])]
                .sort((a, b) => b.quantity - a.quantity)
                .map((a) => (
                  <Link key={a.id} href={`/contracts/${a.contract.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1 text-xs hover:bg-surface-2">
                    <span className="truncate">{tenantName(a.contract.tenant, locale)}</span>
                    <span className="tabular-nums">
                      ×{a.quantity} · {t.kind[a.kind]}
                    </span>
                  </Link>
                ))}
            </div>
          </details>
        </Card>
      )}

      {editMode && (
        <Card className="mb-3 flex flex-wrap items-center gap-2 border-primary/30 bg-primary-soft/40 p-3 text-sm">
          <MousePointerClick className="size-4 text-primary" />
          <span className="flex-1">{selected ? `${t.floors.spot} ${selected.label} — ${t.floors.placeHere}` : t.floors.editorHint}</span>
          <Button size="sm" variant="outline" disabled={!selected} onClick={rotate}>
            <RotateCw className="size-3.5" />
            {t.floors.rotate}
          </Button>
          <Button size="sm" variant="outline" disabled={!selected} onClick={() => selected && setEdits((e) => new Map(e).set(selected.id, null))}>
            <Trash2 className="size-3.5" />
            {t.floors.removeFromMap}
          </Button>
          <Button size="sm" disabled={!edits.size} loading={saving} onClick={saveLayout}>
            <Save className="size-3.5" />
            {t.floors.saveLayout} {edits.size ? `(${edits.size})` : ''}
          </Button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {map.isLoading || !floor ? (
            <Skeleton className="h-[70dvh]" />
          ) : floor.viewBox && floor.svgPath ? (
            <div className="h-[62dvh] min-h-[420px] lg:h-[calc(100dvh-300px)]">
              <FloorMapCanvas
                viewBox={floor.viewBox}
                planSvg={plan.data ?? null}
                spots={placed}
                geometryOverride={edits}
                selectedId={selectedId}
                multiSelected={multi}
                highlight={highlight}
                visibleStatuses={visible}
                editMode={editMode}
                onSpotClick={onSpotClick}
                onCanvasClick={moveTo}
              />
            </div>
          ) : (
            <Card className="p-4">
              <p className="mb-3 text-sm text-muted">{t.floors.noMap}</p>
              <SeatGrid spots={spots} selectedId={selectedId} multiSelected={multi} highlight={highlight} visibleStatuses={visible} onSpotClick={onSpotClick} />
            </Card>
          )}

          {floor?.svgPath && unplaced.length > 0 && (
            <Card className="mt-4 p-4">
              <p className="text-sm font-semibold">
                {t.floors.unplaced} <span className="text-muted">({unplaced.length})</span>
              </p>
              <p className="mb-3 text-xs text-muted">{t.floors.unplacedHint}</p>
              <SeatGrid spots={unplaced} selectedId={selectedId} multiSelected={multi} highlight={highlight} visibleStatuses={visible} onSpotClick={onSpotClick} />
            </Card>
          )}
        </div>

        {/* side panel (desktop) */}
        <div className="hidden lg:sticky lg:top-20 lg:block lg:h-[calc(100dvh-300px)]">
          {selectMode ? (
            <Card className="p-4">
              <p className="text-sm font-semibold">{t.floors.selectMode}</p>
              <p className="mt-1 text-xs text-muted">
                {fmtNumber(multi.size, locale)} {t.floors.selected}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {spots
                  .filter((s) => multi.has(s.id))
                  .map((s) => (
                    <Badge key={s.id} tone="teal">
                      {s.label}
                    </Badge>
                  ))}
              </div>
              <Button className="mt-4 w-full" disabled={!multi.size} onClick={() => router.push(`/contracts/new?spots=${[...multi].join(',')}`)}>
                {t.floors.createContract} ({multi.size})
              </Button>
            </Card>
          ) : selected && !editMode ? (
            <SpotPanel spot={selected} floorCode={code} onClose={() => setSelectedId(null)} onChanged={refresh} />
          ) : (
            <Card className="h-full">
              <EmptyState icon={<MousePointerClick className="size-5" />} title={t.floors.subtitle} hint={editMode ? t.floors.editorHint : undefined} />
            </Card>
          )}
        </div>
      </div>

      {/* mobile sheets */}
      {selected && !editMode && !selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] p-2 lg:hidden">
          <SpotPanel spot={selected} floorCode={code} onClose={() => setSelectedId(null)} onChanged={refresh} />
        </div>
      )}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3 shadow-2xl lg:hidden">
          <Button className="w-full" disabled={!multi.size} onClick={() => router.push(`/contracts/new?spots=${[...multi].join(',')}`)}>
            {t.floors.createContract} ({multi.size})
          </Button>
        </div>
      )}
    </>
  );
}
