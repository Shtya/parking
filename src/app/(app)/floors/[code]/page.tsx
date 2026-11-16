'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { CalendarClock, CheckSquare, ExternalLink, History, Info, MousePointerClick, PenSquare, RotateCw, Save, Search, Trash2, X } from 'lucide-react';
import { api, isApprovalPending } from '@/lib/api';
import { fmtDate, fmtMoney, fmtNumber, floorName, tenantName } from '@/lib/format';
import { D, EASE_INOUT, EASE_OUT } from '@/lib/motion';
import type { Floor, FloorMap, Geometry, MapSpot, SpotStatus } from '@/lib/types';
import { Badge, Button, ContractStatusBadge, ErrorState, Input, LevelSign, Skeleton, StatusBadge, StatusSwatch, cn } from '@/components/ui';
import { usePerm, useI18n } from '@/components/providers';
import { FloorMapCanvas, SeatGrid } from '@/components/floor-map';
import { LevelChips, LevelStack, occupancyOf } from '@/components/level-stack';
import { OccupancyRate } from '@/components/occupancy-rate';

const ALL: SpotStatus[] = ['AVAILABLE', 'RENTED', 'EXPIRING', 'EXPIRED', 'INACTIVE'];

// remembers the last visited level → the plan travels like an elevator (down a level = plan rises)
let lastLevel: number | null = null;

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

/** The spot lens — docks over the plan; the spot number is painted like a floor stencil. */
function SpotLens({ spot, floorCode, onClose, onChanged }: { spot: MapSpot; floorCode: string; onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { perm } = usePerm();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data: detail } = useQuery({ queryKey: ['spot', spot.id], queryFn: () => api<SpotDetail>(`/spots/${spot.id}`) });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const toggleService = async () => {
    await api(`/spots/${spot.id}`, { method: 'PATCH', body: { isActive: !spot.isActive } });
    toast.success(spot.isActive ? t.floors.setOutOfService : t.floors.setInService);
    onChanged();
  };
  const days = spot.daysLeft;
  return (
    <div className="flex max-h-full flex-col overflow-hidden" data-level={floorCode} role="region" aria-label={`${t.floors.spot} ${spot.label}`}>
      <div className="h-1 shrink-0 bg-[var(--lv)]" />
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <LevelSign code={floorCode} size="sm" />
          <p className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold text-muted">{t.floors.spot}</span>
            <span className="stencil text-[28px]">{spot.label}</span>
          </p>
        </div>
        <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} aria-label={t.common.close}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pt-1">
        <StatusBadge status={spot.status} />
        {spot.contract?.needsReview && <Badge tone="amber">{t.floors.reviewBadge}</Badge>}
        {!spot.geometry && <Badge tone="gray">{t.floors.unplaced}</Badge>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {spot.tenant ? (
          <Link href={`/tenants/${spot.tenant.id}`} className="block text-[15px] leading-snug font-extrabold hover:text-accent">
            {tenantName(spot.tenant, locale)}
          </Link>
        ) : (
          <p className="text-[15px] font-extrabold text-muted">{t.floors.noTenant}</p>
        )}
        {spot.contract && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[12px] text-muted">{t.floors.contract}</dt>
              <dd>
                <Link href={`/contracts/${spot.contract.id}`} className="font-sign font-bold text-accent hover:underline">
                  {spot.contract.number}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">{t.floors.daysLeft}</dt>
              <dd className={cn('font-sign text-[17px] font-bold', days !== undefined && days < 0 ? 'text-danger' : days !== undefined && days <= 60 ? 'text-warning' : '')}>
                {days !== undefined ? fmtNumber(days, locale) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">{t.floors.start}</dt>
              <dd className="font-semibold">{fmtDate(spot.contract.startDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">{t.floors.end}</dt>
              <dd className="font-semibold">{fmtDate(spot.contract.endDate, locale)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[12px] text-muted">{t.floors.kind}</dt>
              <dd className="font-semibold">
                {spot.kind ? t.kind[spot.kind] : '—'} · {t.spotType[spot.type]}
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {spot.contract && (spot.status === 'EXPIRING' || spot.status === 'EXPIRED') && (
            <Link href={`/contracts/${spot.contract.id}?renew=1`}>
              <Button size="sm">
                <CalendarClock className="size-3.5" />
                {t.floors.renew}
              </Button>
            </Link>
          )}
          {spot.contract && (
            <Link href={`/contracts/${spot.contract.id}`}>
              <Button size="sm" variant="outline">
                <ExternalLink className="size-3.5" />
                {t.floors.viewContract}
              </Button>
            </Link>
          )}
          {spot.status === 'AVAILABLE' && (
            <Link href={`/contracts/new?spots=${spot.id}`}>
              <Button size="sm">{t.floors.newContract}</Button>
            </Link>
          )}
          {perm('spots.edit') && (
            <Button size="sm" variant="ghost" onClick={toggleService}>
              {spot.isActive ? t.floors.setOutOfService : t.floors.setInService}
            </Button>
          )}
        </div>

        <section className="mt-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-muted">
            <History className="size-3.5" />
            {t.floors.history}
          </h3>
          {!detail ? (
            <Skeleton className="h-16" />
          ) : !detail.history.length ? (
            <p className="text-sm text-muted">{t.floors.noHistory}</p>
          ) : (
            <ol className="relative space-y-4 border-s-2 border-border ps-4">
              {detail.history.map((h) => (
                <li key={h.contract.id} className="relative text-sm">
                  <span className="absolute -start-[23px] top-1.5 size-3 rounded-full border-2 border-surface bg-[var(--lv)]" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/contracts/${h.contract.id}`} className="font-sign font-bold text-accent hover:underline">
                      {h.contract.number}
                    </Link>
                    <ContractStatusBadge status={h.contract.status} />
                  </div>
                  <p className="mt-0.5 font-semibold">{tenantName(h.tenant, locale)}</p>
                  <p className="text-[12px] text-muted">
                    {fmtDate(h.contract.startDate, locale)} – {fmtDate(h.contract.endDate, locale)}, {fmtMoney(h.annualPrice, locale)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export default function FloorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = decodeURIComponent(rawCode).toUpperCase();
  const { t, locale } = useI18n();
  const { perm } = usePerm();
  const router = useRouter();
  const qc = useQueryClient();

  const floors = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  const map = useQuery({ queryKey: ['floor', code], queryFn: () => api<FloorMap>(`/floors/${code}`) });
  const svgPath = map.data?.floor.svgPath;
  const plan = useQuery({
    queryKey: ['plan', svgPath],
    enabled: Boolean(svgPath),
    staleTime: Infinity,
    queryFn: async () => (await fetch(svgPath!).then((r) => r.text())).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState<Set<SpotStatus>>(new Set(ALL));
  const [selectMode, setSelectMode] = useState(false);
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Map<string, Geometry | null>>(new Map());
  const [saving, setSaving] = useState(false);

  // elevator direction
  const floorMeta = floors.data?.find((f) => f.code === code);
  const [travel, setTravel] = useState(0);
  useEffect(() => {
    if (!floorMeta) return;
    setTravel(lastLevel === null ? 0 : Math.sign(lastLevel - floorMeta.level));
    lastLevel = floorMeta.level;
  }, [floorMeta]);

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
  const template = useMemo(() => spots.find((s) => s.geometry)?.geometry ?? null, [spots]);

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

  // searching a single spot number flies the camera to it
  const focusId = selectedId ?? (highlight && highlight.size === 1 ? [...highlight][0] : null);

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
    const base = (edits.has(selected.id) ? edits.get(selected.id) : selected.geometry) ?? template;
    let geo: Geometry;
    if (base) {
      const dx = pt.x - base.cx;
      const dy = pt.y - base.cy;
      geo = { cx: pt.x, cy: pt.y, points: base.points.map(([x, y]) => [x + dx, y + dy]) };
    } else {
      geo = { cx: pt.x, cy: pt.y, points: [[pt.x - 125, pt.y - 250], [pt.x + 125, pt.y - 250], [pt.x + 125, pt.y + 250], [pt.x - 125, pt.y + 250]] };
    }
    setEdits((e) => new Map(e).set(selected.id, geo));
  };
  const rotate = () => {
    if (!selected) return;
    const g = edits.has(selected.id) ? edits.get(selected.id) : selected.geometry;
    if (!g) return;
    setEdits((e) => new Map(e).set(selected.id, { ...g, points: g.points.map(([x, y]) => [g.cx - (y - g.cy), g.cy + (x - g.cx)] as [number, number]) }));
  };
  const saveLayout = async () => {
    setSaving(true);
    try {
      await api('/spots/geometry/bulk', { method: 'PUT', body: { items: [...edits.entries()].map(([id, geometry]) => ({ id, geometry })) } });
      toast.success(t.floors.layoutSaved);
      setEdits(new Map());
      await qc.invalidateQueries({ queryKey: ['floor', code] });
    } catch (e) {
      if (isApprovalPending(e)) setEdits(new Map());
      else toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['floor', code] });
    qc.invalidateQueries({ queryKey: ['floors'] });
    qc.invalidateQueries({ queryKey: ['spot'] });
  };

  if (map.error) return <ErrorState error={map.error} onRetry={map.refetch} />;
  const floor = map.data?.floor;
  const stats = map.data?.stats;
  const allocated = map.data?.allocations.reduce((a, x) => a + x.quantity, 0) ?? 0;
  const occ = floorMeta ? occupancyOf(floorMeta) : null;

  return (
    <div className="lg:grid lg:grid-cols-[236px_1fr] lg:gap-8" data-level={code}>
      {/* level stack — the building in section */}
      <aside className="hidden lg:block">
        <div className="sticky top-20">{floors.data ? <LevelStack floors={floors.data} current={code} /> : <Skeleton className="h-96" />}</div>
      </aside>

      <div className="min-w-0">
        <div className="mb-4 lg:hidden">{floors.data && <LevelChips floors={floors.data} current={code} />}</div>

        {/* header: the level sign is the focal point */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <LevelSign code={code} size="lg" />
            <div>
              <h1 className="text-[20px] leading-tight font-extrabold tracking-tight">{floor ? floorName(floor, locale) : ' '}</h1>
              {occ && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
                  <span>
                    <b className="font-sign text-fg">{fmtNumber(occ.occ, locale)}</b> {t.floors.inUseOf} <b className="font-sign text-fg">{fmtNumber(occ.cap, locale)}</b>
                  </span>
                  <OccupancyRate value={occ.rate} size="chip" label={floorName(floor, locale)} />
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input icon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.floors.searchSpot} aria-label={t.floors.searchSpot} className="w-56" />
            {!editMode && (
              <Button
                variant={selectMode ? 'highlight' : 'outline'}
                aria-pressed={selectMode}
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
            {perm('spots.edit') && !selectMode && (
              <Button
                variant={editMode ? 'primary' : 'outline'}
                aria-pressed={editMode}
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
        </header>

        {code === 'YARD' && floor && (
          <details className="mb-3 rounded-panel bg-surface px-4 py-3 text-sm shadow-e1">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
              <Info className="size-4 text-accent" aria-hidden />
              <span>{t.floors.unnumberedBanner}:</span>
              <b className={cn('font-sign', allocated > (floor.officialCapacity ?? 0) && 'text-danger')}>
                {fmtNumber(allocated, locale)} {t.floors.allocated}
              </b>
              <span className="text-muted">
                {t.floors.ofCapacity} {fmtNumber(floor.officialCapacity, locale)}
              </span>
            </summary>
            <div className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {[...(map.data?.allocations ?? [])]
                .sort((a, b) => b.quantity - a.quantity)
                .map((a) => (
                  <Link key={a.id} href={`/contracts/${a.contract.id}`} className="flex justify-between gap-2 rounded-[6px] px-2 py-1.5 text-[13px] hover:bg-sunken">
                    <span className="truncate">{tenantName(a.contract.tenant, locale)}</span>
                    <span className="font-sign shrink-0 font-bold">×{a.quantity}</span>
                  </Link>
                ))}
            </div>
          </details>
        )}

        <AnimatePresence>
          {editMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: D.std, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-panel bg-highlight/15 px-4 py-3 text-sm ring-1 ring-highlight/50">
                <MousePointerClick className="size-4" aria-hidden />
                <span className="flex-1 font-semibold">{selected ? `${t.floors.spot} ${selected.label}: ${t.floors.placeHere}` : t.floors.editorHint}</span>
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the plan — travels like an elevator between levels */}
        <motion.div
          key={code}
          initial={travel ? { y: travel * 48, opacity: 0 } : { opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: D.std + 0.1, ease: EASE_INOUT }}
          className="relative"
        >
          {map.isLoading || !floor ? (
            <Skeleton className="h-[68dvh] rounded-sheet" />
          ) : floor.viewBox && floor.svgPath ? (
            <div className="relative h-[64dvh] min-h-[440px] shadow-e1 lg:h-[calc(100dvh-220px)]">
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
                focusId={focusId}
                onSpotClick={onSpotClick}
                onCanvasClick={moveTo}
              />
              {/* legend / filters — glass over the plan */}
              <div className="glass absolute top-3 start-3 z-[20] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1 rounded-panel p-1" role="group" aria-label={t.floors.legend}>
                {ALL.map((s) => {
                  const on = visible.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setVisible((v) => {
                          const n = new Set(v);
                          if (n.has(s)) n.delete(s);
                          else n.add(s);
                          return n.size ? n : new Set(ALL);
                        })
                      }
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-semibold transition-[background-color,opacity] duration-[180ms]',
                        on ? 'hover:bg-sunken/70' : 'opacity-40 line-through hover:opacity-70',
                      )}
                    >
                      <StatusSwatch status={s} />
                      <span className="hidden sm:inline">{t.status[s]}</span>
                      <span className="sr-only sm:hidden">{t.status[s]}</span>
                      <span className="font-sign font-bold">{stats ? fmtNumber(stats[s], locale) : '–'}</span>
                    </button>
                  );
                })}
              </div>

              {/* spot lens (desktop: docked over the plan) */}
              <AnimatePresence>
                {(selected && !editMode && !selectMode) || selectMode ? (
                  <motion.aside
                    key={selectMode ? 'select' : selected?.id}
                    initial={{ opacity: 0, x: locale === 'ar' ? -24 : 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: locale === 'ar' ? -16 : 16 }}
                    transition={{ duration: D.std, ease: EASE_OUT }}
                    className="glass absolute top-[3.75rem] end-3 z-[30] hidden max-h-[calc(100%-13rem)] w-[288px] flex-col overflow-hidden rounded-panel lg:flex"
                  >
                    {selectMode ? (
                      <div className="flex w-full flex-col p-5">
                        <p className="text-[15px] font-extrabold">{t.floors.selectMode}</p>
                        <p className="mt-1 text-[13px] text-muted">{t.floors.selectHint}</p>
                        <p className="stencil mt-4 text-[32px]">{fmtNumber(multi.size, locale)}</p>
                        <p className="text-[13px] font-semibold text-muted">{t.floors.selected}</p>
                        <div className="mt-4 flex flex-wrap gap-1">
                          {spots
                            .filter((s) => multi.has(s.id))
                            .map((s) => (
                              <motion.span key={s.id} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-sign rounded-[4px] bg-highlight px-2 py-0.5 text-[13px] font-bold text-highlight-ink">
                                {s.label}
                              </motion.span>
                            ))}
                        </div>
                        <div className="flex-1" />
                        <Button size="lg" disabled={!multi.size} onClick={() => router.push(`/contracts/new?spots=${[...multi].join(',')}`)}>
                          {t.floors.createContract}
                        </Button>
                      </div>
                    ) : (
                      selected && <SpotLens spot={selected} floorCode={code} onClose={() => setSelectedId(null)} onChanged={refresh} />
                    )}
                  </motion.aside>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <div className="rounded-sheet bg-surface p-5 shadow-e1">
              <p className="mb-4 text-sm text-muted">{t.floors.noMap}</p>
              <SeatGrid spots={spots} selectedId={selectedId} multiSelected={multi} highlight={highlight} visibleStatuses={visible} onSpotClick={onSpotClick} />
            </div>
          )}
        </motion.div>

        {floor?.svgPath && unplaced.length > 0 && (
          <details className="mt-4 rounded-panel bg-surface p-4 shadow-e1">
            <summary className="cursor-pointer text-sm font-bold">
              {t.floors.unplaced} <span className="font-sign text-muted">({unplaced.length})</span>
            </summary>
            <p className="mt-1 mb-3 text-[13px] text-muted">{t.floors.unplacedHint}</p>
            <SeatGrid spots={unplaced} selectedId={selectedId} multiSelected={multi} highlight={highlight} visibleStatuses={visible} onSpotClick={onSpotClick} />
          </details>
        )}

        {/* no-drawing areas show the lens inline */}
        {!floor?.svgPath && selected && !selectMode && (
          <div className="mt-4 hidden overflow-hidden rounded-sheet bg-surface shadow-e2 lg:block">
            <SpotLens spot={selected} floorCode={code} onClose={() => setSelectedId(null)} onChanged={refresh} />
          </div>
        )}
      </div>

      {/* mobile: lens as a bottom sheet */}
      <AnimatePresence>
        {selected && !editMode && !selectMode && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: D.std, ease: EASE_OUT }}
            className="fixed inset-x-0 bottom-0 z-40 flex max-h-[52dvh] flex-col overflow-hidden rounded-t-sheet bg-surface shadow-e4 lg:hidden"
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden />
            <SpotLens spot={selected} floorCode={code} onClose={() => setSelectedId(null)} onChanged={refresh} />
          </motion.div>
        )}
      </AnimatePresence>
      {selectMode && (
        <div className="glass fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 rounded-none p-3 lg:hidden">
          <span className="font-sign text-2xl font-extrabold">{multi.size}</span>
          <span className="flex-1 text-[13px] text-muted">{t.floors.selected}</span>
          <Button disabled={!multi.size} onClick={() => router.push(`/contracts/new?spots=${[...multi].join(',')}`)}>
            {t.floors.createContract}
          </Button>
        </div>
      )}
    </div>
  );
}
