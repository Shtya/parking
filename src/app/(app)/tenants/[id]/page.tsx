'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney, fmtNumber, tenantName } from '@/lib/format';
import type { AllocationLine, Contact, Contract, ContractSpotLine } from '@/lib/types';
import { Badge, Button, Card, CardHeader, ContractStatusBadge, EmptyState, ErrorState, PageHeader, Skeleton, Table, Td, Th } from '@/components/ui';
import { useCan, useI18n } from '@/components/providers';
import { ContactFormModal, TenantFormModal, type TenantFormValue } from '@/components/tenant-form';

interface TenantDetail extends TenantFormValue {
  id: string;
  contacts: Contact[];
  units: { id: string; floorLabel: string; unitNo: string; area: string; status: string }[];
  contracts: (Omit<Contract, 'spots' | 'allocations' | 'tenant' | 'daysLeft'> & { spots: ContractSpotLine[]; allocations: AllocationLine[] })[];
}

export default function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['tenant', id], queryFn: () => api<TenantDetail>(`/tenants/${id}`) });
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<{ open: boolean; c?: Contact }>({ open: false });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const active = data.contracts.filter((c) => c.status === 'ACTIVE');
  const spotCount = active.reduce((a, c) => a + c.spots.length + c.allocations.reduce((x, y) => x + y.quantity, 0), 0);
  const removeContact = async (c: Contact) => {
    if (!confirm(`${t.common.delete}: ${c.name}?`)) return;
    await api(`/tenants/${id}/contacts/${c.id}`, { method: 'DELETE' });
    toast.success(t.common.saved);
    qc.invalidateQueries({ queryKey: ['tenant', id] });
  };

  return (
    <>
      <PageHeader
        back={
          <Link href="/tenants" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
            {t.tenants.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tenantName(data, locale)}
            {data.code && <Badge tone="teal">{data.code}</Badge>}
            {data.status === 'INACTIVE' && <Badge tone="gray">{t.tenants.inactive}</Badge>}
          </span>
        }
        subtitle={locale === 'ar' ? data.nameEn : data.nameAr}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t.common.edit}
            </Button>
            <Link href={`/contracts/new?tenantId=${id}`}>
              <Button>
                <Plus className="size-4" />
                {t.contracts.new}
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t.tenants.details} />
          <dl className="space-y-3 px-5 pb-5 text-sm">
            {(
              [
                [t.tenants.units, data.officeUnits],
                [t.common.email, data.email],
                [t.common.phone, data.phone],
                [t.tenants.cr, data.crNumber],
                [t.tenants.minSpots, data.minSpots],
                [
                  t.tenants.spots,
                  <span key="s" className={spotCount < data.minSpots ? 'font-semibold text-amber-600' : 'font-semibold'}>
                    {fmtNumber(spotCount, locale)}
                    {spotCount < data.minSpots && ` · ${t.tenants.belowMin}`}
                  </span>,
                ],
                [t.common.notes, data.notes],
              ] as [string, React.ReactNode][]
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-end break-words">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t.tenants.contacts}
            action={
              <Button size="sm" variant="outline" onClick={() => setContact({ open: true })}>
                <Plus className="size-3.5" />
                {t.tenants.addContact}
              </Button>
            }
          />
          {!data.contacts.length ? (
            <EmptyState title={t.common.noData} hint={t.tenants.reminders} />
          ) : (
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {data.contacts.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 font-medium">
                        {c.name}
                        {c.isPrimary && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                      </p>
                      {c.position && <p className="text-xs text-muted">{c.position}</p>}
                    </div>
                    <div className="flex">
                      <Button size="icon" variant="ghost" onClick={() => setContact({ open: true, c })}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeContact(c)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs" dir="ltr">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-muted hover:text-primary">
                        <Mail className="size-3.5" />
                        {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted hover:text-primary">
                        <Phone className="size-3.5" />
                        {c.phone}
                      </a>
                    )}
                    {c.whatsapp && (
                      <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-primary">
                        <MessageCircle className="size-3.5" />
                        {c.whatsapp}
                      </a>
                    )}
                  </div>
                  {c.receiveReminders && (
                    <Badge tone="teal" className="mt-2">
                      {t.tenants.reminders}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t.tenants.contracts} />
        {!data.contracts.length ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.contracts.number}</Th>
                <Th>{t.common.status}</Th>
                <Th>{t.contracts.period}</Th>
                <Th>{t.contracts.spots}</Th>
                <Th>{t.contracts.annual}</Th>
              </tr>
            </thead>
            <tbody>
              {data.contracts.map((c) => {
                const byFloor = new Map<string, string[]>();
                c.spots.forEach((s) => byFloor.set(s.spot.floor.code, [...(byFloor.get(s.spot.floor.code) ?? []), s.spot.label]));
                return (
                  <tr key={c.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/contracts/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.number}
                      </Link>
                      {c.needsReview && (
                        <Badge tone="amber" className="ms-2">
                          {t.contracts.needsReview}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <ContractStatusBadge status={c.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {fmtDate(c.startDate, locale)} – {fmtDate(c.endDate, locale)}
                    </Td>
                    <Td className="text-xs">
                      {[...byFloor.entries()].map(([f, l]) => (
                        <div key={f}>
                          <b>{f}</b>: {l.join(', ')}
                        </div>
                      ))}
                      {c.allocations.map((a) => (
                        <div key={a.id}>
                          <b>{a.floor.code}</b>: ×{a.quantity}
                        </div>
                      ))}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{fmtMoney(c.annualAmount, locale)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {data.units.length > 0 && (
        <Card className="mt-4">
          <CardHeader title={t.tenants.officeUnits} />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {data.units.map((u) => (
              <Badge key={u.id}>
                {u.floorLabel} · {u.unitNo} · {u.area} m²
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {can('ADMIN', 'OWNER', 'STAFF') && <TenantFormModal open={editing} onClose={() => setEditing(false)} initial={data} />}
      <ContactFormModal open={contact.open} onClose={() => setContact({ open: false })} tenantId={id} initial={contact.c} />
    </>
  );
}
