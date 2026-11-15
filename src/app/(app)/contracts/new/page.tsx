'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fmtMoney, fmtNumber, isoToday, tenantName } from '@/lib/format';
import type { Contract, Floor, FloorMap, MapSpot, Paged, Settings, SpotKind, SpotStatus, SpotType, TenantListItem } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Skeleton, Textarea, cn, DateInput } from '@/components/ui';
import { FloorMapCanvas, SeatGrid } from '@/components/floor-map';
import { Counter } from '@/components/motion-bits';
import { useCan, useI18n } from '@/components/providers';

interface SpotRow {
  id: string;
  label: string;
  type: SpotType;
  status: SpotStatus;
  floor: { code: string; nameAr: string; nameEn: string; level: number };
}
interface Line {
  spotId: string;
  kind: SpotKind;
  price: string;
}
interface Alloc {
  floorCode: string;
  quantity: number;
  kind: SpotKind;
  price: string;
}

function addYear(d: string) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCFullYear(x.getUTCFullYear() + 1);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
}

/** The floor plan as a picker: available spots toggle into the contract. */
function PlanPicker({ code, chosen, onToggle }: { code: string; chosen: Set<string>; onToggle: (id: string) => void }) {
  const { t } = useI18n();
  const map = useQuery({ queryKey: ['floor', code], queryFn: () => api<FloorMap>(`/floors/${code}`) });
  const svgPath = map.data?.floor.svgPath;
  const plan = useQuery({
    queryKey: ['plan', svgPath],
    enabled: Boolean(svgPath),
    staleTime: Infinity,
    queryFn: async () => (await fetch(svgPath!).then((r) => r.text())).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
  });
  const visible = useMemo(() => new Set<SpotStatus>(['AVAILABLE', 'RENTED', 'EXPIRING', 'EXPIRED', 'INACTIVE']), []);
  const empty = useMemo(() => new Map(), []);
  if (!map.data) return <Skeleton className="h-[380px] rounded-sheet" />;
  const f = map.data.floor;
  const pick = (s: MapSpot) => (s.status === 'AVAILABLE' ? onToggle(s.id) : toast.info(`${s.label}: ${t.status[s.status]}`));
  if (!f.viewBox || !f.svgPath)
    return (
      <SeatGrid spots={map.data.spots} selectedId={null} multiSelected={chosen} highlight={null} visibleStatuses={visible} onSpotClick={pick} />
    );
  return (
    <div className="h-[clamp(320px,52dvh,520px)]">
      <FloorMapCanvas
        viewBox={f.viewBox}
        planSvg={plan.data ?? null}
        spots={map.data.spots.filter((s) => s.geometry)}
        geometryOverride={empty}
        selectedId={null}
        multiSelected={chosen}
        highlight={null}
        visibleStatuses={visible}
        editMode={false}
        onSpotClick={pick}
      />
    </div>
  );
}

function Steps({ done }: { done: [boolean, boolean] }) {
  const { t } = useI18n();
  const steps = [t.contracts.step1, t.contracts.step2, t.contracts.step3];
  const current = !done[0] ? 0 : !done[1] ? 1 : 2;
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={t.contracts.new}>
      {steps.map((s, i) => {
        const complete = i < 2 && done[i as 0 | 1];
        return (
          <li key={s} className="flex items-center gap-3" aria-current={i === current ? 'step' : undefined}>
            <span
              className={cn(
                'font-sign grid size-7 place-items-center rounded-full text-[13px] font-bold transition-colors duration-[450ms]',
                complete ? 'bg-success text-white' : i === current ? 'bg-accent text-primary-fg' : 'bg-sunken text-muted',
              )}
            >
              {complete ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-[14px] font-bold', i === current ? 'text-fg' : 'text-muted')}>{s}</span>
            {i < 2 && <span className="h-px w-8 bg-border-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function NewContractForm() {
  const { t, locale } = useI18n();
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const sp = useSearchParams();

  const tenants = useQuery({ queryKey: ['tenants', 'all'], queryFn: () => api<Paged<TenantListItem>>('/tenants', { query: { pageSize: 500, status: 'ACTIVE' } }) });
  const spots = useQuery({ queryKey: ['spots', 'available'], queryFn: () => api<SpotRow[]>('/spots', { query: { status: 'AVAILABLE' } }) });
  const floors = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });

  const [tenantId, setTenantId] = useState(sp.get('tenantId') ?? '');
  const [start, setStart] = useState(isoToday());
  const [end, setEnd] = useState(addYear(isoToday()));
  const [lines, setLines] = useState<Line[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [pickFloor, setPickFloor] = useState('');
  const [notes, setNotes] = useState('');
  const [allowBelow, setAllowBelow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ids = sp.get('spots')?.split(',').filter(Boolean) ?? [];
    if (ids.length) setLines(ids.map((id) => ({ spotId: id, kind: 'PAID', price: '' })));
  }, [sp]);
  useEffect(() => setEnd(addYear(start)), [start]);

  const spotMap = useMemo(() => new Map(spots.data?.map((s) => [s.id, s])), [spots.data]);
  const floorSpots = spots.data?.filter((s) => s.floor.code === pickFloor) ?? [];
  const tenant = tenants.data?.items.find((x) => x.id === tenantId);
  const minSpots = tenant?.minSpots ?? settings.data?.minSpotsPerTenant ?? 2;
  const count = lines.length + allocs.reduce((a, x) => a + (x.quantity || 0), 0);
  const priceOf = (l: Line) => (l.price !== '' ? Number(l.price) : l.kind === 'INCLUDED' ? 0 : settings.data?.pricing[spotMap.get(l.spotId)?.type ?? 'STANDARD'] ?? 0);
  const allocPrice = (a: Alloc) => (a.price !== '' ? Number(a.price) : a.kind === 'INCLUDED' ? 0 : settings.data?.pricing.OUTSIDE ?? 0);
  const total = lines.reduce((a, l) => a + priceOf(l), 0) + allocs.reduce((a, x) => a + allocPrice(x) * (x.quantity || 0), 0);

  const chosenIds = useMemo(() => new Set(lines.map((l) => l.spotId)), [lines]);
  const moneyFmt = useMemo(() => (n: number) => fmtMoney(Math.round(n), locale), [locale]);
  const toggleSpot = (id: string) => setLines((ls) => (ls.some((l) => l.spotId === id) ? ls.filter((l) => l.spotId !== id) : [...ls, { spotId: id, kind: 'PAID', price: '' }]));

  const submit = async (status: 'ACTIVE' | 'DRAFT') => {
    setErr(null);
    if (!tenantId) return setErr(t.contracts.chooseTenant);
    setSaving(true);
    try {
      const c = await api<Contract>('/contracts', {
        method: 'POST',
        body: {
          tenantId, startDate: start, endDate: end, status, notes: notes || null, allowBelowMinimum: allowBelow,
          spots: lines.map((l) => ({ spotId: l.spotId, kind: l.kind, annualPrice: l.price === '' ? undefined : Number(l.price) })),
          allocations: allocs
            .filter((a) => a.quantity > 0)
            .map((a) => ({ floorCode: a.floorCode, quantity: a.quantity, kind: a.kind, annualPrice: a.price === '' ? undefined : Number(a.price) })),
        },
      });
      toast.success(`${t.contracts.created}: ${c.number}`);
      ['contracts', 'dashboard', 'floor', 'floors', 'spots', 'tenants'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      router.push(`/contracts/${c.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SPOT_UNAVAILABLE') {
        setErr(`${e.message}: ${(e.details as { spot: string; tenant: string }[]).map((d) => `${d.spot} (${d.tenant})`).join(', ')}`);
      } else setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const byFloorCount = useMemo(() => {
    const m = new Map<string, number>();
    spots.data?.forEach((s) => m.set(s.floor.code, (m.get(s.floor.code) ?? 0) + 1));
    return m;
  }, [spots.data]);

  return (
    <>
      <PageHeader
        back={
          <Link href="/contracts" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
            {t.contracts.title}
          </Link>
        }
        title={t.contracts.new}
        subtitle={t.contracts.minimumNote}
      />
      <Steps done={[Boolean(tenantId), lines.length + allocs.length > 0]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`${t.contracts.tenant} *`} className="sm:col-span-3">
                <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  <option value="">{t.contracts.chooseTenant}</option>
                  {tenants.data?.items.map((x) => (
                    <option key={x.id} value={x.id}>
                      {tenantName(x, locale)}
                      {x.code ? ` (${x.code})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.contracts.start}>
                <DateInput value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label={t.contracts.end}>
                <DateInput value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.contracts.addSpots} subtitle={t.contracts.pickOnPlan} />
            <div className="px-5 pb-5">
              <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={t.floors.levels}>
                {floors.data
                  ?.filter((f) => byFloorCount.get(f.code))
                  .map((f) => (
                    <button
                      key={f.code}
                      type="button"
                      role="tab"
                      aria-selected={pickFloor === f.code}
                      data-level={f.code}
                      onClick={() => setPickFloor(f.code)}
                      className={cn(
                        'font-sign flex h-9 items-center gap-2 rounded-[6px] px-3 text-[14px] font-bold transition-[background-color,box-shadow] duration-[180ms]',
                        pickFloor === f.code ? 'bg-[var(--lv)] text-white shadow-e1' : 'bg-sunken text-fg hover:bg-border',
                      )}
                    >
                      {f.code}
                      <span className={cn('text-[12px]', pickFloor === f.code ? 'text-white/80' : 'text-muted')}>{byFloorCount.get(f.code)}</span>
                    </button>
                  ))}
              </div>
              {pickFloor && (
                <>
                  <PlanPicker code={pickFloor} chosen={chosenIds} onToggle={toggleSpot} />
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[13px] font-bold text-accent">{t.contracts.pickByNumber}</summary>
                    <div className="mt-3 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                      {floorSpots.map((s) => {
                        const on = lines.some((l) => l.spotId === s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleSpot(s.id)}
                            className={cn(
                              'font-sign h-9 min-w-10 rounded-t-[8px] rounded-b-[3px] px-2 text-[14px] font-bold transition-[background-color,transform] duration-[180ms] active:scale-95',
                              on ? 'bg-highlight text-highlight-ink' : 'bg-success-soft text-success hover:-translate-y-0.5',
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </details>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={`${t.contracts.spots} (${lines.length})`} />
            {!lines.length ? (
              <p className="px-5 pb-5 text-sm text-muted">{t.contracts.noSpots}</p>
            ) : (
              <div className="divide-y divide-border">
                {lines.map((l, i) => {
                  const s = spotMap.get(l.spotId);
                  return (
                    <div key={l.spotId} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                      <Badge tone="teal" className="text-sm">
                        {s ? `${s.floor.code} · ${s.label}` : l.spotId.slice(-6)}
                      </Badge>
                      <span className="text-xs text-muted">{s ? t.spotType[s.type] : ''}</span>
                      <div className="flex-1" />
                      <Select value={l.kind} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, kind: e.target.value as SpotKind } : x)))} className="h-9 w-44">
                        <option value="PAID">{t.kind.PAID}</option>
                        <option value="INCLUDED">{t.kind.INCLUDED}</option>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        placeholder={String(priceOf({ ...l, price: '' }))}
                        value={l.price}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                        className="h-9 w-32"
                        title={t.contracts.price}
                      />
                      <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t.contracts.allocations}
              action={
                <Button size="sm" variant="outline" onClick={() => setAllocs((a) => [...a, { floorCode: 'YARD', quantity: 1, kind: 'PAID', price: '' }])}>
                  <Plus className="size-3.5" />
                  {t.common.add}
                </Button>
              }
            />
            <div className="space-y-2 px-5 pb-5">
              {allocs.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select value={a.floorCode} onChange={(e) => setAllocs((x) => x.map((y, j) => (j === i ? { ...y, floorCode: e.target.value } : y)))} className="h-9 w-40">
                    {floors.data?.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.code}
                      </option>
                    ))}
                  </Select>
                  <Input type="number" min={1} value={a.quantity} onChange={(e) => setAllocs((x) => x.map((y, j) => (j === i ? { ...y, quantity: Number(e.target.value) } : y)))} className="h-9 w-24" title={t.contracts.quantity} />
                  <Select value={a.kind} onChange={(e) => setAllocs((x) => x.map((y, j) => (j === i ? { ...y, kind: e.target.value as SpotKind } : y)))} className="h-9 w-44">
                    <option value="PAID">{t.kind.PAID}</option>
                    <option value="INCLUDED">{t.kind.INCLUDED}</option>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    placeholder={String(allocPrice({ ...a, price: '' }))}
                    value={a.price}
                    onChange={(e) => setAllocs((x) => x.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))}
                    className="h-9 w-32"
                  />
                  <Button variant="ghost" size="icon" onClick={() => setAllocs((x) => x.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <Field label={t.common.notes}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <p className="text-sm font-semibold">{t.contracts.summary}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{t.contracts.tenant}</dt>
                <dd className="max-w-44 truncate text-end">{tenant ? tenantName(tenant, locale) : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t.contracts.totalSpots}</dt>
                <dd className={count < minSpots ? 'font-semibold text-amber-600' : 'font-semibold'}>
                  {fmtNumber(count, locale)} / min {minSpots}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t.contracts.period}</dt>
                <dd>
                  {start} – {end}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted">{t.contracts.estimated}</dt>
                <dd className="font-sign text-[1.5rem] leading-none font-bold">
                  <Counter value={total} format={moneyFmt} />
                </dd>
              </div>
            </dl>
            {count < minSpots && can('ADMIN', 'OWNER') && (
              <div className="mt-3">
                <Checkbox label={t.contracts.allowBelow} checked={allowBelow} onChange={setAllowBelow} />
              </div>
            )}
            {err && <p className="mt-3 rounded-xl bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-300">{err}</p>}
            <Button className="mt-4 w-full" loading={saving} disabled={!tenantId || !count} onClick={() => submit('ACTIVE')}>
              {t.common.create}
            </Button>
            <Button className="mt-2 w-full" variant="ghost" disabled={saving || !tenantId || !count} onClick={() => submit('DRAFT')}>
              {t.contracts.draft}
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function NewContractPage() {
  return (
    <Suspense>
      <NewContractForm />
    </Suspense>
  );
}
