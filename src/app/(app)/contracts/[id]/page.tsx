'use client';

import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, CheckCircle2, Map as MapIcon, XCircle } from 'lucide-react';
import { api, isApprovalPending } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, isoToday, tenantName } from '@/lib/format';
import type { Contract } from '@/lib/types';
import { Badge, Button, Card, CardHeader, ContractStatusBadge, ErrorState, Field, Input, LevelSign, Modal, PageHeader, Skeleton, Table, Td, Textarea, Th, cn, DateInput } from '@/components/ui';
import { usePerm, useI18n } from '@/components/providers';

function ContractDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const { perm } = usePerm();
  const qc = useQueryClient();
  const router = useRouter();
  const sp = useSearchParams();
  const { data: c, isLoading, error, refetch } = useQuery({ queryKey: ['contract', id], queryFn: () => api<Contract>(`/contracts/${id}`) });
  const [renewOpen, setRenewOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renew, setRenew] = useState({ startDate: '', increase: 0, notes: '' });
  const [term, setTerm] = useState({ date: isoToday(), reason: '' });

  useEffect(() => {
    if (sp.get('renew') === '1' && c && (c.status === 'ACTIVE' || c.status === 'EXPIRED') && !c.renewedBy) setRenewOpen(true);
  }, [sp, c]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !c) return <Skeleton className="h-96" />;

  const invalidate = () => {
    ['contract', 'contracts', 'dashboard', 'floor', 'floors'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const doRenew = async () => {
    setBusy(true);
    try {
      const n = await api<Contract>(`/contracts/${id}/renew`, {
        method: 'POST',
        body: { startDate: renew.startDate || undefined, priceIncreasePercent: renew.increase || undefined, notes: renew.notes || undefined },
      });
      toast.success(`${t.contracts.renew}: ${n.number}`);
      invalidate();
      setRenewOpen(false);
      router.push(`/contracts/${n.id}`);
    } catch (e) {
      if (isApprovalPending(e)) setRenewOpen(false);
      else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const doTerminate = async () => {
    setBusy(true);
    try {
      await api(`/contracts/${id}/terminate`, { method: 'POST', body: term });
      toast.success(t.common.saved);
      invalidate();
      setTermOpen(false);
    } catch (e) {
      if (isApprovalPending(e)) setTermOpen(false);
      else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const markReviewed = async () => {
    await api(`/contracts/${id}`, { method: 'PATCH', body: { needsReview: false } });
    toast.success(t.common.saved);
    invalidate();
  };

  const byFloor = new Map<string, NonNullable<Contract['spots']>>();
  c.spots?.forEach((s) => byFloor.set(s.spot.floor.code, [...(byFloor.get(s.spot.floor.code) ?? []), s]));
  const total = (c.spots?.length ?? 0) + (c.allocations?.reduce((a, x) => a + x.quantity, 0) ?? 0);
  const canRenew = (c.status === 'ACTIVE' || c.status === 'EXPIRED') && !c.renewedBy;
  const canTerminate = (c.status === 'ACTIVE' || c.status === 'DRAFT') && perm('contracts.terminate');

  return (
    <>
      <PageHeader
        back={
          <Link href="/contracts" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
            {t.contracts.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.number}
            <ContractStatusBadge status={c.status} daysLeft={c.daysLeft} />
            {c.needsReview && <Badge tone="amber">{t.contracts.needsReview}</Badge>}
          </span>
        }
        subtitle={
          <Link href={`/tenants/${c.tenant.id}`} className="hover:text-primary">
            {tenantName(c.tenant, locale)}
          </Link>
        }
        actions={
          <>
            {c.needsReview && (
              <Button variant="outline" onClick={markReviewed}>
                <CheckCircle2 className="size-4" />
                {t.contracts.markReviewed}
              </Button>
            )}
            {canTerminate && (
              <Button variant="outline" className="text-danger" onClick={() => setTermOpen(true)}>
                <XCircle className="size-4" />
                {t.contracts.terminate}
              </Button>
            )}
          </>
        }
      />

      {/* the focal point: time left on the contract */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div
          className={cn(
            'rounded-sheet p-5 shadow-e1',
            c.status !== 'ACTIVE' ? 'bg-surface' : c.daysLeft <= 30 ? 'bg-danger-soft' : c.daysLeft <= 60 ? 'bg-warning-soft' : 'bg-surface',
          )}
        >
          <p className="text-[14px] font-bold text-muted">{c.status === 'ACTIVE' ? (c.daysLeft >= 0 ? t.contracts.daysRemaining : t.contracts.daysOverdue) : t.contractStatus[c.status]}</p>
          {c.status === 'ACTIVE' ? (
            <p className={cn('stencil mt-2 text-stencil', c.daysLeft <= 30 ? 'text-danger' : c.daysLeft <= 60 ? 'text-warning' : 'text-fg')}>{fmtNumber(Math.abs(c.daysLeft), locale)}</p>
          ) : (
            <p className="stencil mt-2 text-[26px] text-muted">{fmtDate(c.terminatedAt ?? c.endDate, locale)}</p>
          )}
          <p className="mt-3 text-[14px]">
            <span className="font-semibold">{fmtDate(c.startDate, locale)}</span> <span className="text-muted">–</span>{' '}
            <span className="font-semibold">{fmtDate(c.endDate, locale)}</span>
          </p>
          {c.terminatedAt && (
            <p className="mt-2 text-sm font-semibold text-danger">
              {t.contracts.terminatedOn} {fmtDate(c.terminatedAt, locale)}: {c.terminationReason}
            </p>
          )}
          {(c.renewedFrom || c.renewedBy) && (
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {c.renewedFrom && (
                <span>
                  {t.contracts.renewedFrom}{' '}
                  <Link className="font-sign font-bold text-accent hover:underline" href={`/contracts/${c.renewedFrom.id}`}>
                    {c.renewedFrom.number}
                  </Link>
                </span>
              )}
              {c.renewedBy && (
                <span>
                  {t.contracts.renewedBy}{' '}
                  <Link className="font-sign font-bold text-accent hover:underline" href={`/contracts/${c.renewedBy.id}`}>
                    {c.renewedBy.number}
                  </Link>
                </span>
              )}
            </p>
          )}
          {canRenew && (
            <Button variant={c.daysLeft <= 60 ? 'highlight' : 'primary'} className="mt-4" onClick={() => setRenewOpen(true)}>
              <CalendarClock className="size-4" />
              {t.contracts.renew}
            </Button>
          )}
        </div>
        <dl className="grid content-start gap-px overflow-hidden rounded-sheet bg-border/70 shadow-e1">
          <div className="bg-surface p-5">
            <dt className="text-[13px] font-semibold text-muted">{t.contracts.annual}</dt>
            <dd className="font-sign mt-1 text-[24px] leading-tight font-bold">{fmtMoney(c.annualAmount, locale)}</dd>
            <dd className="text-[13px] text-muted">
              {fmtMoney(Number(c.annualAmount) / 12, locale)} {t.dashboard.monthly}
            </dd>
          </div>
          <div className="bg-surface p-5">
            <dt className="text-[13px] font-semibold text-muted">{t.contracts.totalSpots}</dt>
            <dd className="font-sign mt-1 text-[24px] leading-tight font-bold">{fmtNumber(total, locale)}</dd>
            <dd className="mt-2 flex flex-wrap gap-1">
              {[...new Set([...byFloor.keys(), ...(c.allocations?.map((a) => a.floor.code) ?? [])])].map((f) => (
                <LevelSign key={f} code={f} size="sm" />
              ))}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-[15px] font-extrabold">{t.contracts.spots}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[...byFloor.entries()].map(([floor, lines]) => (
            <div key={floor} data-level={floor} className="overflow-hidden rounded-panel bg-surface shadow-e1">
              <div className="flex items-center justify-between gap-2 border-s-4 border-[var(--lv)] px-4 py-3">
                <p className="flex items-center gap-2 font-bold">
                  <LevelSign code={floor} size="sm" />
                  {locale === 'ar' ? lines[0].spot.floor.nameAr : lines[0].spot.floor.nameEn}
                </p>
                <Link href={`/floors/${floor}`} className="flex items-center gap-1 text-[13px] font-bold text-accent hover:underline">
                  <MapIcon className="size-3.5" aria-hidden />
                  {t.contracts.onPlan}
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                {lines.map((l) => (
                  <span
                    key={l.id}
                    title={`${t.kind[l.kind]}, ${fmtMoney(l.annualPrice, locale)}`}
                    className={cn(
                      'font-sign grid h-9 min-w-9 place-items-center rounded-t-[7px] rounded-b-[3px] px-1.5 text-[14px] font-bold',
                      l.kind === 'INCLUDED' ? 'bg-surface text-accent ring-1 ring-accent ring-inset [background-image:repeating-linear-gradient(45deg,transparent_0_5px,color-mix(in_oklab,var(--accent)_10%,transparent)_5px_7px)]' : 'bg-accent text-primary-fg',
                    )}
                  >
                    {l.spot.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {c.allocations?.map((a) => (
            <div key={a.id} data-level={a.floor.code} className="flex items-center gap-4 overflow-hidden rounded-panel border-s-4 border-[var(--lv)] bg-surface px-4 py-4 shadow-e1">
              <LevelSign code={a.floor.code} size="sm" />
              <p className="flex-1 font-bold">{locale === 'ar' ? a.floor.nameAr : a.floor.nameEn}</p>
              <p className="text-end text-sm">
                <span className="font-sign text-[1.5rem] font-bold">×{a.quantity}</span>
                <span className="block text-[12px] text-muted">
                  {t.kind[a.kind]}, {fmtMoney(a.annualPrice, locale)}
                </span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[2px] bg-accent" />
            {t.kind.PAID}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[2px] ring-1 ring-accent ring-inset" />
            {t.kind.INCLUDED}
          </span>
        </p>
      </section>

      {c.notes && (
        <Card className="mt-6 p-5">
          <p className="text-[13px] font-bold text-muted">{t.common.notes}</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{c.notes}</p>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title={t.contracts.deliveries} />
        {!c.deliveries?.length ? (
          <p className="px-5 pb-5 text-sm text-muted">—</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.common.date}</Th>
                <Th>{t.notifications.channel}</Th>
                <Th>{t.notifications.recipient}</Th>
                <Th>{t.common.status}</Th>
                <Th>{t.settings.daysBefore}</Th>
              </tr>
            </thead>
            <tbody>
              {c.deliveries.map((d) => (
                <tr key={d.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(d.createdAt, locale)}</Td>
                  <Td>
                    <Badge>{d.channel}</Badge>
                  </Td>
                  <Td className="text-xs" dir="ltr">
                    {d.recipientType} · {d.channel === 'IN_APP' ? 'in-app' : d.recipient}
                  </Td>
                  <Td>
                    <Badge tone={d.status === 'SENT' ? 'green' : d.status === 'FAILED' ? 'red' : 'gray'}>{d.status}</Badge>
                    {d.error && <p className="text-[11px] text-muted">{d.error}</p>}
                  </Td>
                  <Td>{d.daysBefore ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        title={t.contracts.renewTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenewOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button loading={busy} onClick={doRenew}>
              {t.contracts.renew}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-muted">{t.contracts.renewHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.contracts.start} hint={t.common.optional}>
            <DateInput value={renew.startDate} onChange={(e) => setRenew({ ...renew, startDate: e.target.value })} />
          </Field>
          <Field label={t.contracts.increase}>
            <Input type="number" step="0.5" value={renew.increase} onChange={(e) => setRenew({ ...renew, increase: Number(e.target.value) })} />
          </Field>
          <Field label={t.common.notes} className="sm:col-span-2">
            <Textarea value={renew.notes} onChange={(e) => setRenew({ ...renew, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={termOpen}
        onClose={() => setTermOpen(false)}
        title={t.contracts.terminateTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTermOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" loading={busy} disabled={term.reason.trim().length < 2} onClick={doTerminate}>
              {t.contracts.terminate}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-muted">{t.contracts.terminateHint}</p>
        <div className="grid gap-4">
          <Field label={t.common.date}>
            <DateInput value={term.date} onChange={(e) => setTerm({ ...term, date: e.target.value })} />
          </Field>
          <Field label={`${t.common.reason} *`}>
            <Textarea value={term.reason} onChange={(e) => setTerm({ ...term, reason: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export default function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ContractDetail id={id} />
    </Suspense>
  );
}
