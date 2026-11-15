'use client';

import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, CheckCircle2, Map as MapIcon, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, isoToday, tenantName } from '@/lib/format';
import type { Contract } from '@/lib/types';
import { Badge, Button, Card, CardHeader, ContractStatusBadge, ErrorState, Field, Input, Modal, PageHeader, Skeleton, Table, Td, Textarea, Th } from '@/components/ui';
import { useCan, useI18n } from '@/components/providers';

function ContractDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const can = useCan();
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
      toast.error((e as Error).message);
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
      toast.error((e as Error).message);
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
  const canTerminate = (c.status === 'ACTIVE' || c.status === 'DRAFT') && can('ADMIN', 'OWNER');

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
            {canRenew && (
              <Button onClick={() => setRenewOpen(true)}>
                <CalendarClock className="size-4" />
                {t.contracts.renew}
              </Button>
            )}
            {canTerminate && (
              <Button variant="outline" className="text-red-600" onClick={() => setTermOpen(true)}>
                <XCircle className="size-4" />
                {t.contracts.terminate}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted">{t.contracts.period}</p>
          <p className="mt-1 font-semibold">
            {fmtDate(c.startDate, locale)} → {fmtDate(c.endDate, locale)}
          </p>
          {c.status === 'ACTIVE' && (
            <p className={c.daysLeft <= 30 ? 'mt-1 text-sm text-red-600' : c.daysLeft <= 60 ? 'mt-1 text-sm text-amber-600' : 'mt-1 text-sm text-muted'}>
              {c.daysLeft >= 0 ? `${fmtNumber(c.daysLeft, locale)} ${t.common.days} ${t.contracts.remaining}` : `${fmtNumber(-c.daysLeft, locale)} ${t.common.days} ${t.contracts.overdue}`}
            </p>
          )}
          {c.terminatedAt && (
            <p className="mt-2 text-sm text-red-600">
              {t.contracts.terminatedOn} {fmtDate(c.terminatedAt, locale)} — {c.terminationReason}
            </p>
          )}
          <div className="mt-4 space-y-1 text-sm">
            {c.renewedFrom && (
              <p>
                {t.contracts.renewedFrom}:{' '}
                <Link className="text-primary hover:underline" href={`/contracts/${c.renewedFrom.id}`}>
                  {c.renewedFrom.number}
                </Link>
              </p>
            )}
            {c.renewedBy && (
              <p>
                {t.contracts.renewedBy}:{' '}
                <Link className="text-primary hover:underline" href={`/contracts/${c.renewedBy.id}`}>
                  {c.renewedBy.number}
                </Link>
              </p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted">{t.contracts.annual}</p>
          <p className="mt-1 text-2xl font-semibold">{fmtMoney(c.annualAmount, locale)}</p>
          <p className="text-sm text-muted">
            {fmtMoney(Number(c.annualAmount) / 12, locale)} {t.dashboard.monthly}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted">{t.contracts.totalSpots}</p>
          <p className="mt-1 text-2xl font-semibold">{fmtNumber(total, locale)}</p>
          <p className="text-sm text-muted">{[...byFloor.keys(), ...(c.allocations?.map((a) => a.floor.code) ?? [])].join(' · ')}</p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t.contracts.spots} />
        <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
          {[...byFloor.entries()].map(([floor, lines]) => (
            <div key={floor} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">
                  {floor} · <span className="font-normal text-muted">{locale === 'ar' ? lines[0].spot.floor.nameAr : lines[0].spot.floor.nameEn}</span>
                </p>
                <Link href={`/floors/${floor}`} className="text-xs text-primary hover:underline">
                  <MapIcon className="me-1 inline size-3.5" />
                  {t.nav.floors}
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lines.map((l) => (
                  <span
                    key={l.id}
                    title={`${t.kind[l.kind]} · ${fmtMoney(l.annualPrice, locale)}`}
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${l.kind === 'INCLUDED' ? 'border-dashed border-primary/50 text-primary' : 'border-border'}`}
                  >
                    {l.spot.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {c.allocations?.map((a) => (
            <div key={a.id} className="rounded-xl border border-border p-3">
              <p className="font-semibold">
                {a.floor.code} · <span className="font-normal text-muted">{locale === 'ar' ? a.floor.nameAr : a.floor.nameEn}</span>
              </p>
              <p className="mt-1 text-sm">
                ×{a.quantity} — {t.kind[a.kind]} · {fmtMoney(a.annualPrice, locale)} / {t.common.spot}
              </p>
            </div>
          ))}
        </div>
        <p className="px-5 pb-4 text-xs text-muted">
          <span className="me-1 inline-block rounded border border-dashed border-primary/50 px-1.5">#</span>
          {t.kind.INCLUDED} · <span className="mx-1 inline-block rounded border border-border px-1.5">#</span>
          {t.kind.PAID}
        </p>
      </Card>

      {c.notes && (
        <Card className="mt-4 p-5">
          <p className="text-xs text-muted">{t.common.notes}</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{c.notes}</p>
        </Card>
      )}

      <Card className="mt-4">
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
            <Input type="date" value={renew.startDate} onChange={(e) => setRenew({ ...renew, startDate: e.target.value })} />
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
            <Input type="date" value={term.date} onChange={(e) => setTerm({ ...term, date: e.target.value })} />
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
